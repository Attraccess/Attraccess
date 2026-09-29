import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, In, MoreThan, Repository } from 'typeorm';
import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  MeteringCollectNodeDataSchema,
  MeteringStartNodeDataSchema,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceMeteringOperation,
  ResourceMeteringOperationKind,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { ResourceFlowsExecutorService } from '../flows/resource-flows-executor.service';
import type { MeteringReport } from '../flows/node-executors';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { energyCharge, formatKwh, MeteringValueError, toMicroWh } from './energy';

const CLOCK_SKEW_MS = 5_000;
const INTERIM_MAX_AGE_MS = 5 * 60_000;

export type MeterProblem =
  'start-trigger-missing' | 'ready-unreachable' | 'collect-trigger-missing' | 'report-unreachable';

export type FinalCollection =
  { status: 'not-metered' } | { status: 'ready'; operationId: string } | { status: 'unavailable'; reason: string };

export class MeteringOperationError extends Error {}

class MeteringTimeoutError extends MeteringOperationError {
  constructor(seconds: number) {
    super(`The metering flow did not reply within ${seconds}s`);
  }
}

@Injectable()
export class ResourceMeteringService implements OnModuleInit {
  private readonly logger = new Logger(ResourceMeteringService.name);
  private readonly queues = new Map<number, Promise<unknown>>();
  /** Freshness bound per pending operation. Pending operations never survive a restart, so memory is enough. */
  private readonly freshAfter = new Map<string, Date>();

  constructor(
    @InjectRepository(ResourceMeteringSession) private readonly sessions: Repository<ResourceMeteringSession>,
    @InjectRepository(ResourceMeteringOperation) private readonly operations: Repository<ResourceMeteringOperation>,
    @InjectRepository(ResourceFlowNode) private readonly nodes: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) private readonly edges: Repository<ResourceFlowEdge>,
    @Inject(forwardRef(() => ResourceFlowsExecutorService)) private readonly flows: ResourceFlowsExecutorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.operations.update({ status: 'pending' }, { status: 'expired', error: 'Interrupted by a restart' });
  }

  // ---- meter definition -------------------------------------------------------------------------

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  async getDefinition(resourceId: number) {
    const [nodes, edges] = await Promise.all([
      this.nodes.find({ where: { resourceId } }),
      this.edges.find({ where: { resourceId } }),
    ]);
    const reachable = (triggerType: ResourceFlowNodeType, sinkType: ResourceFlowNodeType): boolean => {
      const types = new Map(nodes.map((node) => [node.id, node.type]));
      const queue = nodes.filter((node) => node.type === triggerType).map((node) => node.id);
      const seen = new Set(queue);
      while (queue.length) {
        const id = queue.shift() as string;
        if (types.get(id) === sinkType) return true;
        for (const edge of edges) {
          if (edge.source === id && !seen.has(edge.target)) {
            seen.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      return false;
    };
    const has = (type: ResourceFlowNodeType) => nodes.some((node) => node.type === type);
    const problems: MeterProblem[] = [];
    if (!has(ResourceFlowNodeType.INPUT_METERING_START)) problems.push('start-trigger-missing');
    else if (!reachable(ResourceFlowNodeType.INPUT_METERING_START, ResourceFlowNodeType.OUTPUT_METERING_READY)) {
      problems.push('ready-unreachable');
    }
    if (!has(ResourceFlowNodeType.INPUT_METERING_COLLECT)) problems.push('collect-trigger-missing');
    else if (!reachable(ResourceFlowNodeType.INPUT_METERING_COLLECT, ResourceFlowNodeType.OUTPUT_METERING_REPORT)) {
      problems.push('report-unreachable');
    }
    const start = MeteringStartNodeDataSchema.parse(
      nodes.find((node) => node.type === ResourceFlowNodeType.INPUT_METERING_START)?.data ?? {},
    );
    const collect = MeteringCollectNodeDataSchema.parse(
      nodes.find((node) => node.type === ResourceFlowNodeType.INPUT_METERING_COLLECT)?.data ?? {},
    );
    return { configured: problems.length === 0, problems, start, collect };
  }

  // ---- lifecycle --------------------------------------------------------------------------------

  /**
   * Establishes the metering session for a (still tentative) usage. Throws when the meter is missing or
   * does not acknowledge, so an unmetered billed session can never start.
   * `supersedes` is the usage of a takeover's outgoing session: its meter is about to be re-initialized.
   */
  async initialize(input: {
    resourceId: number;
    usageId: number;
    creditsPerKwh: number;
    supersedes?: number;
  }): Promise<void> {
    const definition = await this.getDefinition(input.resourceId);
    if (!definition.configured) {
      throw new BadRequestException('METER_NOT_CONFIGURED', { description: definition.problems.join(', ') });
    }
    const session = await this.sessions.save({
      id: randomUUID(),
      resourceId: input.resourceId,
      usageId: input.usageId,
      status: ResourceMeteringSessionStatus.Active,
      creditsPerKwh: input.creditsPerKwh,
    } as ResourceMeteringSession);
    if (input.supersedes !== undefined) {
      await this.sessions.update(
        { usageId: input.supersedes },
        { compromisedReason: 'The meter was re-initialized by a takeover that did not complete' },
      );
    }
    try {
      await this.runOperation(session, 'start', {
        trigger: ResourceFlowNodeType.INPUT_METERING_START,
        timeoutSeconds: definition.start.timeoutSeconds,
      });
    } catch (error) {
      await this.sessions.delete({ id: session.id });
      throw new BadRequestException('METER_INITIALIZATION_FAILED', { description: this.reason(error) });
    }
    // The meter now belongs to the new session; earlier unsettled totals can no longer be reconciled.
    await this.sessions.update(
      { resourceId: input.resourceId, status: ResourceMeteringSessionStatus.Pending },
      {
        status: ResourceMeteringSessionStatus.Failed,
        failureReason: 'The meter was re-initialized for a later session',
      },
    );
  }

  /** Never throws: a missing final total must not prevent the usage from ending. */
  async collectFinal(usageId: number, freshAfter: Date): Promise<FinalCollection> {
    const session = await this.sessions.findOne({ where: { usageId } });
    if (!session || session.status !== ResourceMeteringSessionStatus.Active) return { status: 'not-metered' };
    if (session.compromisedReason) return { status: 'unavailable', reason: session.compromisedReason };
    const { collect } = await this.getDefinition(session.resourceId);
    let reason = 'No attempt was made';
    for (let attempt = 1; attempt <= collect.finalAttempts; attempt++) {
      try {
        const operation = await this.runOperation(session, 'final', {
          trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
          timeoutSeconds: collect.timeoutSeconds,
          freshAfter,
        });
        return { status: 'ready', operationId: operation.id };
      } catch (error) {
        reason = this.reason(error);
        this.logger.warn(
          `Final metering collection ${attempt}/${collect.finalAttempts} for usage ${usageId} failed: ${reason}`,
        );
        if (attempt < collect.finalAttempts && collect.finalRetryDelaySeconds > 0) {
          await new Promise((resolve) => setTimeout(resolve, collect.finalRetryDelaySeconds * 1000));
        }
      }
    }
    return { status: 'unavailable', reason };
  }

  /** Runs inside the transaction that ends the usage, before the bill is finalized. Idempotent. */
  async settleInTransaction(manager: EntityManager, usageId: number, final: FinalCollection): Promise<void> {
    const session = await manager.findOne(ResourceMeteringSession, { where: { usageId } });
    if (!session || session.status !== ResourceMeteringSessionStatus.Active) return;
    const operation =
      final.status === 'ready'
        ? await manager.findOne(ResourceMeteringOperation, {
            where: { id: final.operationId, sessionId: session.id, kind: 'final', status: 'completed' },
          })
        : null;
    if (!operation) {
      const superseded = await manager.count(ResourceMeteringSession, {
        where: { resourceId: session.resourceId, usageId: MoreThan(usageId) },
      });
      await manager.update(ResourceMeteringSession, session.id, {
        status: superseded ? ResourceMeteringSessionStatus.Failed : ResourceMeteringSessionStatus.Pending,
        failureReason: superseded
          ? 'The meter was re-initialized for a later session before the final reading was collected'
          : final.status === 'unavailable'
            ? final.reason
            : 'No final reading was collected',
      });
      return;
    }
    const transaction = await manager.findOneOrFail(BillingTransaction, { where: { resourceUsageId: usageId } });
    await this.addEnergyItem(manager, transaction, session, operation);
    await manager.update(ResourceMeteringSession, session.id, {
      status: ResourceMeteringSessionStatus.Settled,
      consumedMicroWh: operation.totalMicroWh,
      chargeCredits: energyCharge(BigInt(operation.totalMicroWh as string), session.creditsPerKwh),
      finalOperationId: operation.id,
      failureReason: null,
      settledAt: new Date(),
    });
  }

  private async addEnergyItem(
    manager: EntityManager,
    transaction: BillingTransaction,
    session: ResourceMeteringSession,
    operation: ResourceMeteringOperation,
  ): Promise<number> {
    const externalReference = `metering:${session.id}:${operation.id}`;
    const charge = energyCharge(BigInt(operation.totalMicroWh as string), session.creditsPerKwh);
    if (
      await manager.findOne(BillingTransactionItem, {
        where: { billingTransactionId: transaction.id, externalReference },
      })
    ) {
      return charge;
    }
    await manager.save(BillingTransactionItem, {
      billingTransactionId: transaction.id,
      name: 'ENERGY',
      description: null,
      externalReference,
      unitPrice: charge,
      quantity: 1,
      energyMicroWh: operation.totalMicroWh,
      energyCreditsPerKwh: session.creditsPerKwh,
    });
    return charge;
  }

  /** Removes the metering of a tentative usage that is being rolled back. */
  async discardCandidate(manager: EntityManager, usageId: number): Promise<void> {
    await manager.delete(ResourceMeteringSession, { usageId });
  }

  // ---- reconciliation ---------------------------------------------------------------------------

  /** Retries the final collection of a usage that already ended and bills the energy as a separate correction. */
  async retrySettlement(
    resourceId: number,
    sessionId: string,
    initiatorId: number,
  ): Promise<ResourceMeteringSession> {
    const session = await this.sessions.findOne({ where: { id: sessionId, resourceId } });
    if (!session) throw new BadRequestException('METER_SESSION_NOT_FOUND');
    if (session.status !== ResourceMeteringSessionStatus.Pending) {
      throw new ConflictException('METER_SESSION_NOT_PENDING');
    }
    const usage = await this.sessions.manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId } });
    if (!usage.endTime) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const { collect } = await this.getDefinition(resourceId);
    try {
      await this.assertMeterStillOwned(session);
      const operation = await this.runOperation(session, 'final', {
        trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
        timeoutSeconds: collect.timeoutSeconds,
        freshAfter: usage.endTime,
      });
      await this.settleLate(session.id, operation.id, initiatorId);
    } catch (error) {
      const reason = this.reason(error);
      await this.sessions.update({ id: session.id }, { failureReason: reason });
      throw new BadRequestException('METER_SETTLEMENT_FAILED', { description: reason });
    }
    return this.sessions.findOneByOrFail({ id: session.id });
  }

  private async assertMeterStillOwned(session: ResourceMeteringSession): Promise<void> {
    if (session.compromisedReason) throw new MeteringOperationError(session.compromisedReason);
    const newer = await this.sessions.count({
      where: { resourceId: session.resourceId, usageId: MoreThan(session.usageId) },
    });
    if (newer > 0) throw new MeteringOperationError('A later session already uses the meter');
  }

  /** The usage's bill is completed and immutable: the energy goes onto a new correction transaction. */
  private async settleLate(sessionId: string, operationId: string, initiatorId: number): Promise<void> {
    await runSerializedTransaction(this.sessions.manager, async (manager) => {
      const session = await manager.findOneOrFail(ResourceMeteringSession, { where: { id: sessionId } });
      if (session.status !== ResourceMeteringSessionStatus.Pending) return;
      const operation = await manager.findOneOrFail(ResourceMeteringOperation, { where: { id: operationId } });
      const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId }, relations: ['user'] });
      const original = await manager.findOneOrFail(BillingTransaction, {
        where: { resourceUsageId: usage.id, status: BillingTransactionStatus.Completed },
      });
      const charge = energyCharge(BigInt(operation.totalMicroWh as string), session.creditsPerKwh);
      const factor = usage.billingFactor ?? usage.user.billingFactor;
      const discount = Math.round(charge - charge * (factor / 100));
      const correction = await manager.save(BillingTransaction, {
        userId: original.userId,
        initiatorId,
        correctionOfId: original.id,
        amount: -(charge - discount),
        status: BillingTransactionStatus.Completed,
      });
      await this.addEnergyItem(manager, correction, session, operation);
      if (discount !== 0) {
        await manager.save(BillingTransactionItem, {
          billingTransactionId: correction.id,
          name: 'BILLING_FACTOR',
          description: `${factor}%`,
          externalReference: `metering:${session.id}:${operation.id}:discount`,
          unitPrice: -discount,
          quantity: 1,
        });
      }
      await manager.update(ResourceMeteringSession, session.id, {
        status: ResourceMeteringSessionStatus.Settled,
        consumedMicroWh: operation.totalMicroWh,
        chargeCredits: charge,
        finalOperationId: operation.id,
        failureReason: null,
        settledAt: new Date(),
      });
    });
  }

  async waive(resourceId: number, sessionId: string): Promise<ResourceMeteringSession> {
    const result = await this.sessions.update(
      {
        id: sessionId,
        resourceId,
        status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
      },
      { status: ResourceMeteringSessionStatus.Waived, settledAt: new Date() },
    );
    if (!result.affected) throw new ConflictException('METER_SESSION_NOT_PENDING');
    return this.sessions.findOneByOrFail({ id: sessionId });
  }

  /** The running session's latest accepted total and what it costs so far; `session` is null when nothing is metered. */
  async getLive(resourceId: number) {
    const session = await this.findActiveSession(resourceId);
    if (!session) return { session: null };
    const total = session.latestMicroWh === null ? null : BigInt(session.latestMicroWh);
    return {
      session: {
        sessionId: session.id,
        usageId: session.usageId,
        creditsPerKwh: session.creditsPerKwh,
        latestKwh: total === null ? null : formatKwh(total),
        energyCredits: total === null ? null : energyCharge(total, session.creditsPerKwh),
        latestObservedAt: session.latestObservedAt,
        source: session.source,
      },
    };
  }

  private findActiveSession(resourceId: number) {
    return this.sessions
      .createQueryBuilder('s')
      .innerJoin(ResourceUsage, 'u', 'u.id = s.usageId')
      .where('s.resourceId = :resourceId AND s.status = :status AND u.endTime IS NULL AND u.lifecyclePending = false', {
        resourceId,
        status: ResourceMeteringSessionStatus.Active,
      })
      .getOne();
  }

  async getStatus(resourceId: number) {
    const definition = await this.getDefinition(resourceId);
    const active = await this.findActiveSession(resourceId);
    const unsettled = await this.sessions.find({
      where: { resourceId, status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]) },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const kwh = (value: string | null) => (value === null ? null : formatKwh(BigInt(value)));
    return {
      configured: definition.configured,
      problems: definition.problems,
      interimIntervalMinutes: definition.collect.interimIntervalMinutes,
      activeSession: active && {
        sessionId: active.id,
        usageId: active.usageId,
        latestKwh: kwh(active.latestMicroWh),
        latestObservedAt: active.latestObservedAt,
        source: active.source,
      },
      unsettled: unsettled.map((session) => ({
        sessionId: session.id,
        usageId: session.usageId,
        status: session.status,
        reason: session.failureReason,
        latestKwh: kwh(session.latestMicroWh),
        retryable: session.status === ResourceMeteringSessionStatus.Pending,
      })),
    };
  }

  // ---- interim readings -------------------------------------------------------------------------

  @Cron(CronExpression.EVERY_MINUTE)
  async collectInterimReadings(): Promise<void> {
    const rows = await this.sessions
      .createQueryBuilder('s')
      .innerJoin(ResourceUsage, 'u', 'u.id = s.usageId')
      .where('s.status = :status AND u.endTime IS NULL AND u.lifecyclePending = false', {
        status: ResourceMeteringSessionStatus.Active,
      })
      .getMany();
    for (const session of rows) {
      try {
        const { collect } = await this.getDefinition(session.resourceId);
        if (collect.interimIntervalMinutes === 0) continue;
        const last = session.latestObservedAt ?? session.createdAt;
        if (Date.now() - last.getTime() < collect.interimIntervalMinutes * 60_000) continue;
        const busy = await this.sessions.manager.findOne(ResourceUsageLifecycleAttempt, {
          where: { resourceId: session.resourceId },
        });
        if (busy) continue;
        await this.runOperation(session, 'interim', {
          trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
          timeoutSeconds: collect.timeoutSeconds,
        });
      } catch (error) {
        this.logger.warn(`Interim metering for resource ${session.resourceId} failed: ${this.reason(error)}`);
      }
    }
  }

  // ---- operations -------------------------------------------------------------------------------

  private enqueue<T>(resourceId: number, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(resourceId) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.queues.set(resourceId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.queues.get(resourceId) === next) this.queues.delete(resourceId);
      });
    return next;
  }

  private runOperation(
    session: ResourceMeteringSession,
    kind: ResourceMeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperation> {
    return this.enqueue(session.resourceId, async () => {
      const requestedAt = new Date();
      const operation = await this.operations.save({
        id: randomUUID(),
        sessionId: session.id,
        resourceId: session.resourceId,
        kind,
        status: 'pending',
        requestedAt,
      } as ResourceMeteringOperation);
      if (options.freshAfter) this.freshAfter.set(operation.id, options.freshAfter);
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          this.flows.runFlow(
            session.resourceId,
            options.trigger,
            {
              metering: {
                sessionId: session.id,
                operationId: operation.id,
                resourceId: session.resourceId,
                usageId: session.usageId,
                kind,
                requestedAt: requestedAt.toISOString(),
              },
            },
            undefined,
            {
              metering: { operationId: operation.id, kind, complete: (report) => this.complete(operation.id, report) },
            },
          ),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new MeteringTimeoutError(options.timeoutSeconds)),
              options.timeoutSeconds * 1000,
            );
          }),
        ]);
      } catch (error) {
        await this.close(
          operation.id,
          error instanceof MeteringTimeoutError ? 'expired' : 'failed',
          this.reason(error),
        );
        throw error;
      } finally {
        clearTimeout(timer);
        this.freshAfter.delete(operation.id);
      }
      const done = await this.operations.findOneByOrFail({ id: operation.id });
      if (done.status !== 'completed') {
        const message = `The ${kind === 'start' ? 'start' : 'collection'} branch finished without ${kind === 'start' ? 'acknowledging' : 'reporting'}`;
        await this.close(operation.id, 'failed', message);
        throw new MeteringOperationError(message);
      }
      return done;
    });
  }

  private async close(operationId: string, status: 'failed' | 'expired', error: string): Promise<void> {
    await this.operations.update({ id: operationId, status: 'pending' }, { status, error, completedAt: new Date() });
  }

  /** The single reply channel of an operation; wrong-session, late and conflicting replies are rejected. */
  private async complete(operationId: string, report: MeteringReport): Promise<void> {
    await runSerializedTransaction(this.sessions.manager, async (manager) => {
      const operation = await manager.findOne(ResourceMeteringOperation, { where: { id: operationId } });
      if (!operation) throw new MeteringOperationError('Unknown metering operation');
      const session = await manager.findOneOrFail(ResourceMeteringSession, { where: { id: operation.sessionId } });
      if (session.resourceId !== operation.resourceId) {
        throw new MeteringOperationError('Reply belongs to another session');
      }
      if ((operation.kind === 'start') !== (report.kind === 'ready')) {
        throw new MeteringOperationError(`A ${report.kind} reply does not answer a ${operation.kind} request`);
      }
      const now = new Date();

      if (report.kind === 'ready') {
        const baseline = report.baseline ? toMicroWh(report.baseline.value, report.baseline.unit).toString() : null;
        if (operation.status !== 'pending') {
          if (operation.status === 'completed' && (session.baselineMicroWh ?? null) === baseline) return;
          throw new MeteringOperationError('The start request was already answered or has expired');
        }
        await manager.update(ResourceMeteringSession, session.id, {
          baselineMicroWh: baseline,
          source: report.source ?? session.source,
        });
        await manager.update(ResourceMeteringOperation, operation.id, {
          status: 'completed',
          completedAt: now,
          source: report.source ?? null,
        });
        return;
      }

      const reading = toMicroWh(report.value, report.unit);
      const total = reading - BigInt(session.baselineMicroWh ?? 0);
      if (total < BigInt(0)) {
        throw new MeteringValueError('counter_decreased', 'The counter is below the baseline captured at the start');
      }
      const observedAt = report.observedAt ? new Date(report.observedAt) : now;
      if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
        throw new MeteringValueError('invalid_observation_time', 'The observation time is invalid or in the future');
      }
      if (operation.status !== 'pending') {
        if (operation.status === 'completed' && operation.totalMicroWh === total.toString()) return;
        throw new MeteringOperationError('The collection was already answered or has expired');
      }
      const freshAfter =
        operation.kind === 'final'
          ? this.freshAfter.get(operation.id)
          : new Date(operation.requestedAt.getTime() - INTERIM_MAX_AGE_MS);
      if (freshAfter && observedAt < freshAfter) {
        throw new MeteringValueError(
          'stale_reading',
          `The reading was observed at ${observedAt.toISOString()}, before ${freshAfter.toISOString()}`,
        );
      }
      if (session.latestMicroWh !== null && total < BigInt(session.latestMicroWh)) {
        throw new MeteringValueError('counter_decreased', 'The total is lower than an earlier reading of this session');
      }
      if (
        session.status !== ResourceMeteringSessionStatus.Active &&
        session.status !== ResourceMeteringSessionStatus.Pending
      ) {
        throw new MeteringOperationError('The metering session is closed');
      }
      await manager.update(ResourceMeteringSession, session.id, {
        latestMicroWh: total.toString(),
        latestObservedAt: observedAt,
        source: report.source ?? session.source,
      });
      await manager.update(ResourceMeteringOperation, operation.id, {
        status: 'completed',
        completedAt: now,
        totalMicroWh: total.toString(),
        observedAt,
        source: report.source ?? null,
      });
    });
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

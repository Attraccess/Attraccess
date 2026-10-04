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
  ResourceMeter,
  Resource,
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
import { AuditService } from '../../audit/audit.service';
import { LiveNotificationsService } from '../../billing/liveNotificationsService';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { toLegacyMeterValue } from './legacy-energy-conversion';
import { MeteringValueError, meterCharge, meterDiscount, formatMeterValue, toMeterValue } from './quantity';

const CLOCK_SKEW_MS = 5_000;
const INTERIM_MAX_AGE_MS = 5 * 60_000;

export type MeterProblem =
  'start-trigger-missing' | 'ready-unreachable' | 'collect-trigger-missing' | 'report-unreachable';

type MeterFinal = { status: 'ready'; operationId: string } | { status: 'unavailable'; reason: string };
export type FinalCollection = { status: 'not-metered' } | { status: 'collected'; meters: Record<string, MeterFinal> };

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
  // ponytail: in-memory; after a restart the cadence falls back to the last successful reading
  private readonly interimAttempts = new Map<string, { at: number; running: boolean }>();

  constructor(
    @InjectRepository(ResourceMeter) private readonly meters: Repository<ResourceMeter>,
    @InjectRepository(ResourceMeteringSession) private readonly sessions: Repository<ResourceMeteringSession>,
    @InjectRepository(ResourceMeteringOperation) private readonly operations: Repository<ResourceMeteringOperation>,
    @InjectRepository(ResourceFlowNode) private readonly nodes: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) private readonly edges: Repository<ResourceFlowEdge>,
    @Inject(forwardRef(() => ResourceFlowsExecutorService)) private readonly flows: ResourceFlowsExecutorService,
    private readonly audit: AuditService,
    private readonly liveNotifications: LiveNotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.operations.update({ status: 'pending' }, { status: 'expired', error: 'Interrupted by a restart' });
  }

  // ---- meter definition -------------------------------------------------------------------------

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  async getDefinition(resourceId: number, meterId: number) {
    const flow = await this.getDefinitionFlow(resourceId);
    return this.definitionFromFlow(meterId, flow);
  }

  private async getDefinitionFlow(resourceId: number) {
    const [allNodes, edges] = await Promise.all([
      this.nodes.find({ where: { resourceId } }),
      this.edges.find({ where: { resourceId } }),
    ]);
    return { allNodes, edges };
  }

  private definitionFromFlow(
    meterId: number,
    {
      allNodes,
      edges,
    }: {
      allNodes: ResourceFlowNode[];
      edges: ResourceFlowEdge[];
    },
  ) {
    const nodes = allNodes.filter((n) => !String(n.type).includes('.metering.') || n.data?.meterId === meterId);
    const reachable = (triggerType: ResourceFlowNodeType, sinkType: ResourceFlowNodeType): boolean => {
      const types = new Map(nodes.map((node) => [node.id, node.type]));
      const queue = nodes.filter((node) => node.type === triggerType).map((node) => node.id);
      const seen = new Set(queue);
      while (queue.length) {
        const id = queue.shift() as string;
        if (types.get(id) === sinkType) return true;
        for (const edge of edges) {
          if (edge.source === id && types.has(edge.target) && !seen.has(edge.target)) {
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
    const startNode = nodes.find((node) => node.type === ResourceFlowNodeType.INPUT_METERING_START);
    const collectNode = nodes.find((node) => node.type === ResourceFlowNodeType.INPUT_METERING_COLLECT);
    const incrementOnly =
      nodes.some((n) => n.type === ResourceFlowNodeType.OUTPUT_METERING_REPORT && n.data?.mode === 'increment') &&
      !startNode &&
      !collectNode;
    return {
      configured: incrementOnly || problems.length === 0,
      problems: incrementOnly ? [] : problems,
      incrementOnly,
      start: MeteringStartNodeDataSchema.parse(startNode?.data ?? { meterId }),
      collect: MeteringCollectNodeDataSchema.parse(collectNode?.data ?? { meterId }),
      hasCollection: !!collectNode,
    };
  }

  // ---- lifecycle --------------------------------------------------------------------------------

  /**
   * Establishes the metering session for a (still tentative) usage. Throws when the meter is missing or
   * does not acknowledge, so an unmetered billed session can never start.
   * `supersedes` is the usage of a takeover's outgoing session: its meter is about to be re-initialized.
   */
  async initialize(input: { resourceId: number; usageId: number; supersedes?: number }): Promise<void> {
    const usage = await this.sessions.manager.findOneOrFail(ResourceUsage, { where: { id: input.usageId } });
    const meters =
      usage.meterRates ??
      (await this.meters.find({ where: { resourceId: input.resourceId } })).map((m) => ({
        meterId: m.id,
        name: m.name,
        creditsPerUnit: m.creditsPerUnit,
      }));
    try {
      for (const meter of meters) {
        const definition = await this.getDefinition(input.resourceId, meter.meterId);
        if (!definition.configured && meter.creditsPerUnit > 0) {
          throw new BadRequestException(`METER_NOT_CONFIGURED: ${meter.name}`, {
            description: definition.problems.join(', '),
          });
        }
        if (!definition.configured) continue;
        const session = await this.sessions.save({
          id: randomUUID(),
          resourceId: input.resourceId,
          usageId: input.usageId,
          meterId: meter.meterId,
          meterName: meter.name,
          status: ResourceMeteringSessionStatus.Active,
          creditsPerUnit: meter.creditsPerUnit,
          collectionMode: definition.incrementOnly ? 'increment' : 'requested',
          latestValue: definition.incrementOnly ? '0' : null,
        });
        if (!definition.incrementOnly) {
          try {
            await this.runOperation(session, 'start', {
              trigger: ResourceFlowNodeType.INPUT_METERING_START,
              timeoutSeconds: definition.start.timeoutSeconds,
            });
          } catch (error) {
            if (meter.creditsPerUnit > 0) throw error;
            await this.sessions.delete(session.id);
            this.logger.warn(`Skipping tracking-only meter ${meter.meterId}: ${this.reason(error)}`);
            continue;
          }
        }
        await this.sessions.update(
          { meterId: meter.meterId, status: ResourceMeteringSessionStatus.Pending },
          {
            status: ResourceMeteringSessionStatus.Failed,
            failureReason: 'The meter was re-initialized for a later session',
          },
        );
      }
    } catch (error) {
      await this.sessions.delete({ usageId: input.usageId });
      if (input.supersedes !== undefined)
        await this.sessions.update(
          { usageId: input.supersedes },
          {
            compromisedReason: 'The meter was re-initialized by a takeover that did not complete',
          },
        );
      throw new BadRequestException(`METER_INITIALIZATION_FAILED: ${this.reason(error)}`);
    }
  }

  /** Never throws: a missing final total must not prevent the usage from ending. */
  async collectFinal(usageId: number, freshAfter: Date): Promise<FinalCollection> {
    const sessions = await this.sessions.find({ where: { usageId, status: ResourceMeteringSessionStatus.Active } });
    if (!sessions.length) return { status: 'not-metered' };
    const meters: Record<string, MeterFinal> = {};
    for (const session of sessions) {
      try {
        meters[session.id] = await this.collectSessionFinal(session, freshAfter);
      } catch (error) {
        meters[session.id] = { status: 'unavailable', reason: this.reason(error) };
      }
    }
    return { status: 'collected', meters };
  }

  private async collectSessionFinal(session: ResourceMeteringSession, freshAfter: Date): Promise<MeterFinal> {
    const usageId = session.usageId;
    if (session.compromisedReason) return { status: 'unavailable', reason: session.compromisedReason };
    if (session.collectionMode === 'increment') {
      const operation = await this.operations.save({
        id: randomUUID(),
        sessionId: session.id,
        meterId: session.meterId,
        resourceId: session.resourceId,
        kind: 'final',
        status: 'completed',
        requestedAt: freshAfter,
        completedAt: new Date(),
        observedAt: freshAfter,
        totalValue: session.latestValue ?? '0',
      });
      return { status: 'ready', operationId: operation.id };
    }
    const { collect } = await this.getDefinition(session.resourceId, session.meterId);
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
    const sessions = await manager.find(ResourceMeteringSession, {
      where: { usageId, status: ResourceMeteringSessionStatus.Active },
    });
    for (const session of sessions) {
      const reading = final.status === 'collected' ? final.meters[session.id] : undefined;
      await this.settleSession(
        manager,
        session,
        reading ?? { status: 'unavailable', reason: 'No final reading was collected' },
      );
    }
  }

  private async settleSession(
    manager: EntityManager,
    session: ResourceMeteringSession,
    final: MeterFinal,
  ): Promise<void> {
    const usageId = session.usageId;
    const operation =
      final.status === 'ready'
        ? await manager.findOne(ResourceMeteringOperation, {
            where: { id: final.operationId, sessionId: session.id, kind: 'final', status: 'completed' },
          })
        : null;
    if (!operation) {
      const superseded = await manager.count(ResourceMeteringSession, {
        where: { resourceId: session.resourceId, meterId: session.meterId, usageId: MoreThan(usageId) },
      });
      const unrecoverable = superseded > 0 || !!session.compromisedReason;
      await manager.update(ResourceMeteringSession, session.id, {
        status: unrecoverable ? ResourceMeteringSessionStatus.Failed : ResourceMeteringSessionStatus.Pending,
        failureReason: superseded
          ? 'The meter was re-initialized for a later session before the final reading was collected'
          : session.compromisedReason
            ? session.compromisedReason
            : final.status === 'unavailable'
              ? final.reason
              : 'No final reading was collected',
      });
      return;
    }
    if (session.creditsPerUnit > 0) {
      const transaction = await manager.findOneOrFail(BillingTransaction, { where: { resourceUsageId: usageId } });
      await this.addMeterItem(manager, transaction, session, operation);
    }
    await manager.update(ResourceMeteringSession, session.id, {
      status: ResourceMeteringSessionStatus.Settled,
      consumedValue: operation.totalValue,
      chargeCredits: meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit),
      finalOperationId: operation.id,
      failureReason: null,
      settledAt: new Date(),
    });
  }

  private async addMeterItem(
    manager: EntityManager,
    transaction: BillingTransaction,
    session: ResourceMeteringSession,
    operation: ResourceMeteringOperation,
  ): Promise<number> {
    const externalReference = `metering:${session.id}:${operation.id}`;
    const charge = meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit);
    if (
      await manager.findOne(BillingTransactionItem, {
        where: { billingTransactionId: transaction.id, externalReference },
      })
    ) {
      return charge;
    }
    await manager.save(BillingTransactionItem, {
      billingTransactionId: transaction.id,
      name: session.meterName,
      description: null,
      externalReference,
      unitPrice: charge,
      quantity: 1,
      meterQuantity: formatMeterValue(BigInt(operation.totalValue as string)),
      meterCreditsPerUnit: session.creditsPerUnit,
    });
    return charge;
  }

  /** Removes the metering of a tentative usage that is being rolled back. */
  async discardCandidate(manager: EntityManager, usageId: number): Promise<void> {
    await manager.delete(ResourceMeteringSession, { usageId });
  }

  // ---- reconciliation ---------------------------------------------------------------------------

  /** Retries the final collection of a usage that already ended and bills the meter consumption as a separate correction. */
  async retrySettlement(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    const session = await this.sessions.findOne({ where: { id: sessionId, resourceId } });
    if (!session) throw new BadRequestException('METER_SESSION_NOT_FOUND');
    if (session.status !== ResourceMeteringSessionStatus.Pending) {
      throw new ConflictException('METER_SESSION_NOT_PENDING');
    }
    const usage = await this.sessions.manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId } });
    if (!usage.endTime) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const { collect } = await this.getDefinition(resourceId, session.meterId);
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
      throw new BadRequestException(`METER_SETTLEMENT_FAILED: ${reason}`);
    }
    return this.sessions.findOneByOrFail({ id: session.id });
  }

  private async assertMeterStillOwned(
    session: ResourceMeteringSession,
    manager = this.sessions.manager,
  ): Promise<void> {
    if (session.compromisedReason) throw new MeteringOperationError(session.compromisedReason);
    const newer = await manager.count(ResourceMeteringSession, {
      where: { resourceId: session.resourceId, meterId: session.meterId, usageId: MoreThan(session.usageId) },
    });
    if (newer > 0) throw new MeteringOperationError('A later session already uses the meter');
  }

  /** The usage's bill is completed and immutable: the meter consumption goes onto a new correction transaction. */
  private async settleLate(sessionId: string, operationId: string, initiatorId: number): Promise<void> {
    const correction = await runSerializedTransaction(this.sessions.manager, async (manager) => {
      const session = await manager.findOneOrFail(ResourceMeteringSession, { where: { id: sessionId } });
      if (session.status !== ResourceMeteringSessionStatus.Pending) return null;
      const operation = await manager.findOneOrFail(ResourceMeteringOperation, { where: { id: operationId } });
      const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId }, relations: ['user'] });
      if (session.creditsPerUnit === 0) {
        await manager.update(ResourceMeteringSession, session.id, {
          status: ResourceMeteringSessionStatus.Settled,
          consumedValue: operation.totalValue,
          chargeCredits: 0,
          finalOperationId: operation.id,
          failureReason: null,
          settledAt: new Date(),
        });
        return null;
      }
      const original = await manager.findOneOrFail(BillingTransaction, {
        where: { resourceUsageId: usage.id, status: BillingTransactionStatus.Completed },
      });
      const charge = meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit);
      const factor = usage.billingFactor ?? usage.user.billingFactor;
      const discount = meterDiscount(charge, factor);
      const correction = await manager.save(BillingTransaction, {
        userId: original.userId,
        initiatorId,
        correctionOfId: original.id,
        amount: -(charge - discount),
        status: BillingTransactionStatus.Completed,
      });
      await this.addMeterItem(manager, correction, session, operation);
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
        consumedValue: operation.totalValue,
        chargeCredits: charge,
        finalOperationId: operation.id,
        failureReason: null,
        settledAt: new Date(),
      });
      void this.audit.recordBillingTransactionAfterCommit(
        {
          transactionId: correction.id,
          userId: correction.userId,
          initiatorId,
          amount: correction.amount,
          status: correction.status,
          source: 'meter-correction',
        },
        manager,
      );
      return correction;
    });
    if (correction) {
      this.liveNotifications
        .notifyTransactionUpdate(correction.id)
        .catch((error) => this.logger.warn(`Failed to publish meter correction ${correction.id}`, error));
    }
  }

  async waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    const result = await this.sessions.update(
      {
        id: sessionId,
        resourceId,
        status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
      },
      { status: ResourceMeteringSessionStatus.Waived, settledAt: new Date() },
    );
    if (!result.affected) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const session = await this.sessions.findOneByOrFail({ id: sessionId });
    void this.audit.recordResource({
      action: 'meter_charge.waived',
      actorId: initiatorId,
      subjectId: resourceId,
      details: {
        usageId: session.usageId,
        meterId: session.meterId,
        ...(session.latestValue === null
          ? {}
          : { waivedCredits: meterCharge(BigInt(session.latestValue), session.creditsPerUnit) }),
      },
    });
    return session;
  }

  async listMeters(resourceId: number) {
    const meters = await this.meters.find({ where: { resourceId }, order: { id: 'ASC' } });
    const active = await this.findActiveSessions(resourceId);
    return meters.map((meter) => {
      const session = active.find((s) => s.meterId === meter.id);
      return {
        id: meter.id,
        name: meter.name,
        creditsPerUnit: meter.creditsPerUnit,
        lifetimeValue: formatMeterValue(BigInt(meter.lifetimeValue)),
        counterValue: meter.counterValue == null ? null : formatMeterValue(BigInt(meter.counterValue)),
        latestObservedAt: meter.latestObservedAt,
        session: session
          ? {
              sessionId: session.id,
              usageId: session.usageId,
              creditsPerUnit: session.creditsPerUnit,
              latestValue: session.latestValue == null ? null : formatMeterValue(BigInt(session.latestValue)),
              chargeCredits:
                session.latestValue == null ? null : meterCharge(BigInt(session.latestValue), session.creditsPerUnit),
              latestObservedAt: session.latestObservedAt,
              source: session.source,
            }
          : null,
      };
    });
  }

  async createMeter(resourceId: number, name: string) {
    if (!(await this.meters.manager.existsBy(Resource, { id: resourceId })))
      throw new BadRequestException('RESOURCE_NOT_FOUND');
    let meter: ResourceMeter;
    try {
      meter = await this.meters.save({ resourceId, name: name.trim() });
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new ConflictException('METER_NAME_EXISTS');
      throw error;
    }
    return this.getMeterDto(resourceId, meter.id);
  }

  async updateMeter(resourceId: number, meterId: number, name: string) {
    const meter = await this.requireMeter(resourceId, meterId);
    try {
      await this.meters.update({ id: meter.id, resourceId }, { name: name.trim() });
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new ConflictException('METER_NAME_EXISTS');
      throw error;
    }
    return this.getMeterDto(resourceId, meterId);
  }

  async setRate(resourceId: number, meterId: number, creditsPerUnit: number) {
    const meter = await this.requireMeter(resourceId, meterId);
    await this.meters.update(meter.id, { creditsPerUnit });
    return this.getMeterDto(resourceId, meterId);
  }

  private async getMeterDto(resourceId: number, meterId: number) {
    const meter = (await this.listMeters(resourceId)).find((m) => m.id === meterId);
    if (!meter) throw new BadRequestException('METER_NOT_FOUND');
    return meter;
  }

  private async requireMeter(resourceId: number, meterId: number, manager = this.meters.manager) {
    const meter = await manager.findOne(ResourceMeter, { where: { id: meterId, resourceId } });
    if (!meter) throw new BadRequestException('METER_NOT_FOUND');
    return meter;
  }

  async getLive(resourceId: number) {
    return { meters: await this.listMeters(resourceId) };
  }

  private findActiveSessions(resourceId: number) {
    return this.sessions
      .createQueryBuilder('s')
      .innerJoin(ResourceUsage, 'u', 'u.id = s.usageId')
      .where('s.resourceId = :resourceId AND s.status = :status AND u.endTime IS NULL AND u.lifecyclePending = false', {
        resourceId,
        status: ResourceMeteringSessionStatus.Active,
      })
      .getMany();
  }

  async getStatus(resourceId: number) {
    const meters = await this.meters.find({ where: { resourceId } });
    const flow = await this.getDefinitionFlow(resourceId);
    const definitions = meters.map((meter) => {
      const definition = this.definitionFromFlow(meter.id, flow);
      return {
        meterId: meter.id,
        name: meter.name,
        creditsPerUnit: meter.creditsPerUnit,
        configured: definition.configured,
        problems: definition.problems,
        interimIntervalMinutes: definition.hasCollection ? definition.collect.interimIntervalMinutes : 0,
      };
    });
    const unsettled = await this.sessions.find({
      where: { resourceId, status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]) },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return {
      meters: definitions,
      unsettled: unsettled.map((session) => ({
        sessionId: session.id,
        meterId: session.meterId,
        meterName: session.meterName,
        usageId: session.usageId,
        status: session.status,
        reason: session.failureReason,
        latestValue: session.latestValue == null ? null : formatMeterValue(BigInt(session.latestValue)),
        retryable: session.status === ResourceMeteringSessionStatus.Pending,
      })),
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async collectInterimReadings(): Promise<void> {
    for (const meter of await this.meters.find()) {
      const key = String(meter.id);
      try {
        const definition = await this.getDefinition(meter.resourceId, meter.id);
        if (!definition.hasCollection || definition.collect.interimIntervalMinutes === 0) continue;
        const attempt = this.interimAttempts.get(key);
        if (
          attempt?.running ||
          Date.now() - (attempt?.at ?? meter.latestObservedAt?.getTime() ?? 0) <
            definition.collect.interimIntervalMinutes * 60_000
        )
          continue;
        if (await this.sessions.manager.existsBy(ResourceUsageLifecycleAttempt, { resourceId: meter.resourceId }))
          continue;
        const session = (await this.findActiveSessions(meter.resourceId)).find((s) => s.meterId === meter.id);
        this.interimAttempts.set(key, { at: Date.now(), running: true });
        try {
          await this.runOperation(
            session ?? { id: null, meterId: meter.id, resourceId: meter.resourceId, usageId: null },
            'interim',
            {
              trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
              timeoutSeconds: definition.collect.timeoutSeconds,
            },
          );
        } finally {
          this.interimAttempts.set(key, { at: Date.now(), running: false });
        }
      } catch (error) {
        this.logger.warn(`Meter ${meter.id} collection failed: ${this.reason(error)}`);
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
    session: { id: string | null; meterId: number; resourceId: number; usageId: number | null },
    kind: ResourceMeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperation> {
    return this.enqueue(session.resourceId, async () => {
      const requestedAt = new Date();
      const operation = await this.operations.save({
        id: randomUUID(),
        sessionId: session.id,
        meterId: session.meterId,
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
                meterId: session.meterId,
                operationId: operation.id,
                resourceId: session.resourceId,
                usageId: session.usageId,
                kind,
                requestedAt: requestedAt.toISOString(),
              },
            },
            undefined,
            {
              metering: {
                meterId: session.meterId,
                operationId: operation.id,
                kind,
                complete: (report) => this.complete(operation.id, report),
              },
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

  /** A normal flow can report a value without an active usage or collection request. */
  async report(
    resourceId: number,
    meterId: number,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    transactionManager?: EntityManager,
    lifecycleAttemptId?: string,
    reportId?: string,
  ): Promise<void> {
    const work = async (manager: EntityManager) => {
      const meter = await this.requireMeter(resourceId, meterId, manager);
      const attempt = await manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId } });
      if (attempt && attempt.id !== lifecycleAttemptId) throw new ConflictException('METER_LIFECYCLE_BUSY');
      const query = manager
        .createQueryBuilder(ResourceMeteringSession, 's')
        .innerJoin(ResourceUsage, 'u', 'u.id = s.usageId')
        .where('s.meterId = :meterId AND s.status = :status', {
          meterId,
          status: ResourceMeteringSessionStatus.Active,
        });
      if (attempt) query.andWhere('u.id = :usageId', { usageId: attempt.candidateUsageId ?? attempt.previousUsageId });
      else query.andWhere('u.endTime IS NULL AND u.lifecyclePending = false');
      const session = await query.getOne();
      const id = reportId ?? randomUUID();
      const existing = await manager.findOne(ResourceMeteringOperation, { where: { id } });
      if (existing) {
        if (
          existing.meterId === meterId &&
          existing.reportedValue === this.readingValue(report).toString() &&
          existing.readingMode === (report.mode ?? 'total')
        )
          return;
        throw new MeteringOperationError('A conflicting reading was already recorded for this flow node');
      }
      const reading = await this.acceptReading(manager, meter, session, report);
      await manager.save(ResourceMeteringOperation, {
        id,
        resourceId,
        meterId,
        sessionId: session?.id ?? null,
        kind: 'interim',
        status: 'completed',
        requestedAt: new Date(),
        completedAt: new Date(),
        totalValue: reading.total,
        observedAt: reading.observedAt,
        source: report.source ?? null,
        reportedValue: this.readingValue(report).toString(),
        readingMode: report.mode ?? 'total',
      });
    };
    if (transactionManager) await work(transactionManager);
    else await runSerializedTransaction(this.sessions.manager, work);
  }

  private readingValue(report: { value: string; legacyEnergyUnit?: string }): bigint {
    return report.legacyEnergyUnit !== undefined
      ? toLegacyMeterValue(report.value, report.legacyEnergyUnit)
      : toMeterValue(report.value);
  }

  private async acceptReading(
    manager: EntityManager,
    meter: ResourceMeter,
    session: ResourceMeteringSession | null,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    freshAfter?: Date,
  ): Promise<{ total: string; observedAt: Date }> {
    const now = new Date();
    const observedAt = report.observedAt ? new Date(report.observedAt) : now;
    if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > now.getTime() + CLOCK_SKEW_MS)
      throw new MeteringValueError('invalid_observation_time', 'The observation time is invalid or in the future');
    if ((freshAfter && observedAt < freshAfter) || (meter.latestObservedAt && observedAt < meter.latestObservedAt))
      throw new MeteringValueError(
        'stale_reading',
        'The reading is older than the required boundary or a previously accepted reading',
      );
    const value = this.readingValue(report);
    const increment = report.mode === 'increment';
    const previous = meter.counterValue == null ? null : BigInt(meter.counterValue);
    if (!increment && previous !== null && value < previous)
      throw new MeteringValueError(
        'counter_decreased',
        'The cumulative counter decreased. Reinitialize its baseline in Metering ready after a reset.',
      );
    const delta = increment ? value : previous === null ? BigInt(0) : value - previous;
    if (!session && delta > BigInt(0))
      await manager.update(
        ResourceMeteringSession,
        { meterId: meter.id, status: ResourceMeteringSessionStatus.Pending },
        {
          status: ResourceMeteringSessionStatus.Failed,
          failureReason:
            'The meter advanced outside the ended session; its final consumption can no longer be distinguished from idle consumption',
        },
      );
    const sessionTotal = session ? BigInt(session.latestValue ?? '0') + delta : null;
    if (sessionTotal !== null && (sessionTotal < BigInt(0) || sessionTotal < BigInt(session?.latestValue ?? '0')))
      throw new MeteringValueError('counter_decreased', 'The session counter decreased');
    if (
      session &&
      ![ResourceMeteringSessionStatus.Active, ResourceMeteringSessionStatus.Pending].includes(session.status)
    )
      throw new MeteringOperationError('The metering session is closed');
    if (sessionTotal !== null && session) meterCharge(sessionTotal, session.creditsPerUnit);
    await manager.update(ResourceMeter, meter.id, {
      lifetimeValue: (BigInt(meter.lifetimeValue) + delta).toString(),
      // Keep an established cumulative counter aligned when increments report the same consumption.
      counterValue: increment ? (previous === null ? null : (previous + delta).toString()) : value.toString(),
      latestObservedAt: observedAt,
    });
    if (session && sessionTotal !== null)
      await manager.update(ResourceMeteringSession, session.id, {
        latestValue: sessionTotal.toString(),
        latestObservedAt: observedAt,
        source: report.source ?? session.source,
      });
    return { total: (sessionTotal ?? value).toString(), observedAt };
  }

  /** Wrong-meter, late and conflicting replies are rejected; repeated completions are idempotent. */
  private async complete(operationId: string, report: MeteringReport): Promise<void> {
    await runSerializedTransaction(this.sessions.manager, async (manager) => {
      const operation = await manager.findOneOrFail(ResourceMeteringOperation, { where: { id: operationId } });
      const session = operation.sessionId
        ? await manager.findOneOrFail(ResourceMeteringSession, { where: { id: operation.sessionId } })
        : null;
      const meter = await this.requireMeter(operation.resourceId, operation.meterId, manager);
      if ((operation.kind === 'start') !== (report.kind === 'ready'))
        throw new MeteringOperationError('The reply does not answer this request');
      if (report.kind === 'ready') {
        const baseline = report.baseline ? this.readingValue(report.baseline).toString() : '0';
        if (operation.status !== 'pending') {
          if (operation.status === 'completed' && session?.baselineValue === baseline) return;
          throw new MeteringOperationError('The start request was already answered or has expired');
        }
        if (!session) throw new MeteringOperationError('A start request requires a session');
        // Baseline readings count consumption since the previous observation, outside this new session.
        const previous = meter.counterValue == null ? null : BigInt(meter.counterValue);
        const delta =
          report.baseline && previous !== null && BigInt(baseline) >= previous
            ? BigInt(baseline) - previous
            : BigInt(0);
        await manager.update(ResourceMeter, meter.id, {
          counterValue: baseline,
          lifetimeValue: (BigInt(meter.lifetimeValue) + delta).toString(),
          latestObservedAt: new Date(),
        });
        await manager.update(ResourceMeteringSession, session.id, {
          baselineValue: baseline,
          source: report.source ?? session.source,
        });
        await manager.update(ResourceMeteringOperation, operation.id, {
          status: 'completed',
          completedAt: new Date(),
          source: report.source ?? null,
        });
        return;
      }
      if (operation.status !== 'pending') {
        if (
          operation.status === 'completed' &&
          operation.reportedValue === this.readingValue(report).toString() &&
          operation.readingMode === (report.mode ?? 'total')
        )
          return;
        throw new MeteringOperationError('The collection was already answered or has expired');
      }
      if (!session) {
        const attempt = await manager.existsBy(ResourceUsageLifecycleAttempt, { resourceId: operation.resourceId });
        const crossedSession = await manager
          .createQueryBuilder(ResourceMeteringSession, 's')
          .innerJoin(ResourceUsage, 'u', 'u.id = s.usageId')
          .where('s.meterId = :meterId', { meterId: meter.id })
          .andWhere('(u.endTime IS NULL OR u.endTime >= :requestedAt)', { requestedAt: operation.requestedAt })
          .getExists();
        if (attempt || crossedSession)
          throw new MeteringOperationError('The idle collection crossed a session boundary');
      } else if (session.status === ResourceMeteringSessionStatus.Pending) {
        const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId } });
        // A current counter cannot distinguish consumption at session end from later idle use.
        // Only a device reading explicitly captured at the persisted end boundary may reconcile it.
        if (!report.observedAt || !usage.endTime || new Date(report.observedAt).getTime() !== usage.endTime.getTime())
          throw new MeteringOperationError('A retry requires a reading captured at the session end boundary');
        await this.assertMeterStillOwned(session, manager);
      }
      const freshAfter =
        operation.kind === 'final'
          ? this.freshAfter.get(operation.id)
          : new Date(operation.requestedAt.getTime() - INTERIM_MAX_AGE_MS);
      const reading = await this.acceptReading(manager, meter, session, report, freshAfter);
      await manager.update(ResourceMeteringOperation, operation.id, {
        status: 'completed',
        completedAt: new Date(),
        totalValue: reading.total,
        observedAt: reading.observedAt,
        source: report.source ?? null,
        reportedValue: this.readingValue(report).toString(),
        readingMode: report.mode ?? 'total',
      });
    });
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

import {
  forwardRef,
  Inject,
  Injectable,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, EntityManager, In } from 'typeorm';

import {
  ResourceMeter,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceFlowNodeType,
  ResourceMeteringOperationKind,
  ResourceUsageLifecycleAttempt,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';

import { ResourceFlowsExecutorService } from '../flows/execution/resource-flows-executor.service';

import { AuditService } from '../../audit/audit.service';

import { LiveNotificationsService } from '../../billing/live-notifications/live-notifications.service';

import { MeteringOperationError, MeteringReadings } from './metering-readings';

import { MeteringReport } from '../flows/node-executors/index';

import { randomUUID } from 'node:crypto';

import { Cron, CronExpression } from '@nestjs/schedule';

import { type FinalCollection, type MeterFinal, MeteringSettlement } from './metering-settlement';

import { MeteringCatalog } from './metering-catalog';

export type { MeterProblem } from './metering-definition';

export type { FinalCollection } from './metering-settlement';

export { MeteringOperationError } from './metering-readings';

export class MeteringTimeoutError extends MeteringOperationError {
  constructor(seconds: number) {
    super(`The metering flow did not reply within ${seconds}s`);
  }
}

@Injectable()
export class ResourceMeteringService implements OnModuleInit {
  public constructor(
    @InjectRepository(ResourceMeter) protected readonly meters: Repository<ResourceMeter>,
    @InjectRepository(ResourceMeteringSession) protected readonly sessions: Repository<ResourceMeteringSession>,
    @InjectRepository(ResourceMeteringOperation) protected readonly operations: Repository<ResourceMeteringOperation>,
    @InjectRepository(ResourceFlowNode) nodes: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) edges: Repository<ResourceFlowEdge>,
    @Inject(forwardRef(() => ResourceFlowsExecutorService)) protected readonly flows: ResourceFlowsExecutorService,
    audit: AuditService,
    liveNotifications: LiveNotificationsService,
  ) {
    this.catalog = new MeteringCatalog(this.meters, this.sessions, nodes, edges);
    this.readings = new MeteringReadings(this.sessions.manager, this.freshAfter);
    this.settlement = new MeteringSettlement(this.sessions, audit, liveNotifications, this.logger);
  }

  protected readonly logger = new Logger('ResourceMeteringService');

  protected readonly catalog: MeteringCatalog;

  protected readonly readings: MeteringReadings;

  protected readonly settlement: MeteringSettlement;

  protected readonly queues = new Map<number, Promise<unknown>>();

  /** Freshness bound per pending operation. Pending operations never survive a restart, so memory is enough. */
  protected readonly freshAfter = new Map<string, Date>();

  // ponytail: in-memory; after a restart the cadence falls back to the last successful reading
  protected readonly interimAttempts = new Map<string, { at: number; running: boolean }>();

  protected reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** A normal flow can report a value without an active usage or collection request. */
  report(
    resourceId: number,
    meterId: number,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    transactionManager?: EntityManager,
    lifecycleAttemptId?: string,
    reportId?: string,
  ): Promise<void> {
    return this.readings.report(resourceId, meterId, report, transactionManager, lifecycleAttemptId, reportId);
  }

  protected async close(operationId: string, status: 'failed' | 'expired', error: string): Promise<void> {
    await this.operations.update({ id: operationId, status: 'pending' }, { status, error, completedAt: new Date() });
  }

  protected runOperation(
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
                complete: (report) => this.readings.complete(operation.id, report),
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

  // ---- operations -------------------------------------------------------------------------------

  protected enqueue<T>(resourceId: number, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(resourceId) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.queues.set(resourceId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.queues.get(resourceId) === next) this.queues.delete(resourceId);
      });
    return next;
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
        const session = (await this.catalog.findActiveSessions(meter.resourceId)).find((s) => s.meterId === meter.id);
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

  getStatus(resourceId: number) {
    return this.catalog.getStatus(resourceId);
  }

  getLive(resourceId: number) {
    return this.catalog.getLive(resourceId);
  }

  setRate(resourceId: number, meterId: number, creditsPerUnit: number) {
    return this.catalog.setRate(resourceId, meterId, creditsPerUnit);
  }

  updateMeter(resourceId: number, meterId: number, name: string) {
    return this.catalog.updateMeter(resourceId, meterId, name);
  }

  createMeter(resourceId: number, name: string) {
    return this.catalog.createMeter(resourceId, name);
  }

  listMeters(resourceId: number) {
    return this.catalog.listMeters(resourceId);
  }

  waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    return this.settlement.waive(resourceId, sessionId, initiatorId);
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
      await this.readings.assertMeterStillOwned(session);
      const operation = await this.runOperation(session, 'final', {
        trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
        timeoutSeconds: collect.timeoutSeconds,
        freshAfter: usage.endTime,
      });
      await this.settlement.settleLate(session.id, operation.id, initiatorId);
    } catch (error) {
      const reason = this.reason(error);
      await this.sessions.update({ id: session.id }, { failureReason: reason });
      throw new BadRequestException(`METER_SETTLEMENT_FAILED: ${reason}`);
    }
    return this.sessions.findOneByOrFail({ id: session.id });
  }

  /** Removes the metering of a tentative usage that is being rolled back. */
  async discardCandidate(manager: EntityManager, usageId: number): Promise<void> {
    await manager.delete(ResourceMeteringSession, { usageId });
  }

  /** Runs inside the transaction that ends the usage, before the bill is finalized. Idempotent. */
  settleInTransaction(manager: EntityManager, usageId: number, final: FinalCollection): Promise<void> {
    return this.settlement.settleInTransaction(manager, usageId, final);
  }

  protected async collectSessionFinal(session: ResourceMeteringSession, freshAfter: Date): Promise<MeterFinal> {
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
    const initializedMeters = new Set<number>();
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
          // Once initialization is issued, the device may reset even without a reply.
          // Increment-only meters dispatch no start branch and retain their outgoing evidence.
          initializedMeters.add(meter.meterId);
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
        // Increment-only starts have no ready reply to invalidate older pending charges.
        // For requested starts this is an idempotent safeguard after atomic acceptance.
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
      if (input.supersedes !== undefined && initializedMeters.size)
        await this.sessions.update(
          { usageId: input.supersedes, meterId: In([...initializedMeters]) },
          {
            compromisedReason: 'The meter was re-initialized by a takeover that did not complete',
          },
        );
      throw new BadRequestException(`METER_INITIALIZATION_FAILED: ${this.reason(error)}`);
    }
  }

  // ---- meter definition -------------------------------------------------------------------------

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  getDefinition(resourceId: number, meterId: number) {
    return this.catalog.getDefinition(resourceId, meterId);
  }

  async onModuleInit(): Promise<void> {
    await this.operations.update({ status: 'pending' }, { status: 'expired', error: 'Interrupted by a restart' });
  }
}

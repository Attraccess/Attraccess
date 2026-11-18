import { Inject, Injectable, OnModuleInit, BadRequestException, ConflictException, Logger } from '@nestjs/common';

import {
  ResourceFlowNodeType,
  MeterAllocationKind,
  MeteringOperationKind,
  ResourceMeteringOperationRecord,
  ResourceMeteringSessionRecord,
  ResourceMeteringSessionStatus,
  MeteringUsageRecord,
} from '@attraccess/application-models';

import { ResourceFlowsExecutorService } from '../flows/execution/resource-flows-executor.service';

import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';

import { LiveNotificationsService } from '../../billing/live-notifications/live-notifications.service';

import { MeteringOperationError, MeteringReadings } from './metering-readings';

import { MeteringReport } from '../flows/node-executors/index';

import type { TransactionContext } from '../../database/transaction-context';

import { UNIT_OF_WORK, UnitOfWork } from '../../database/unit-of-work';

import { METERING_STORE, MeteringStore } from './metering-store.port';

import { randomUUID } from 'node:crypto';

import { Cron, CronExpression } from '@nestjs/schedule';

import { type FinalCollection, type MeterFinal, MeteringSettlement } from './metering-settlement';

import { MeteringCatalog } from './metering-catalog';

import { findActiveMeterSessions, getMeteringSessionLimit } from './meter-sessions';

import { MeteringSegments } from './metering-segments';

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
    @Inject(METERING_STORE) protected readonly store: MeteringStore,
    @Inject(UNIT_OF_WORK) protected readonly unitOfWork: UnitOfWork,
    protected readonly flows: ResourceFlowsExecutorService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
    liveNotifications: LiveNotificationsService,
  ) {
    this.catalog = new MeteringCatalog(this.store);
    this.readings = new MeteringReadings(this.store, this.unitOfWork, this.freshAfter);
    this.settlement = new MeteringSettlement(this.store, this.unitOfWork, audit, liveNotifications, this.logger);
    this.segments = new MeteringSegments(
      this.store,
      this.unitOfWork,
      {
        runOperation: (session, kind, options) => this.runOperation(session, kind, options),
        settleClosed: (segmentId) => this.settlement.settleClosedSegment(segmentId),
      },
      this.logger,
    );
  }

  protected readonly logger = new Logger('ResourceMeteringService');

  protected readonly catalog: MeteringCatalog;

  protected readonly readings: MeteringReadings;

  protected readonly settlement: MeteringSettlement;

  protected readonly segments: MeteringSegments;

  protected readonly queues = new Map<number, Promise<unknown>>();

  /** Freshness bound per pending operation. Pending operations never survive a restart, so memory is enough. */
  protected readonly freshAfter = new Map<string, Date>();

  // ponytail: in-memory; after a restart the cadence falls back to the last successful reading
  protected readonly interimAttempts = new Map<string, { at: number; running: boolean }>();

  protected async requireUsage(usageId: number): Promise<MeteringUsageRecord> {
    const usage = await this.store.findUsage(usageId);
    if (!usage) throw new Error(`The usage ${usageId} does not exist`);
    return usage;
  }

  protected async requireSession(sessionId: string): Promise<ResourceMeteringSessionRecord> {
    const session = await this.store.findSession(sessionId);
    if (!session) throw new Error(`The metering session ${sessionId} does not exist`);
    return session;
  }

  protected reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** A normal flow can report a value without an active usage or collection request. */
  report(
    resourceId: number,
    meterId: number,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    context?: TransactionContext,
    lifecycleAttemptId?: string,
    reportId?: string,
    usageId?: number,
  ): Promise<void> {
    return this.readings.report(resourceId, meterId, report, context, lifecycleAttemptId, reportId, usageId);
  }

  protected async close(operationId: string, status: 'failed' | 'expired', error: string): Promise<void> {
    await this.store.closePendingOperation(operationId, status, error, new Date());
  }

  protected runOperation(
    session: { id: string | null; meterId: number; resourceId: number; usageId: number | null },
    kind: MeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperationRecord> {
    return this.enqueue(session.resourceId, async () => {
      const requestedAt = new Date();
      // A flow addresses the person's own measuring point with the user the session belongs to.
      const userId = session.usageId === null ? null : await this.store.findUsageOwner(session.usageId);
      const operation = await this.store.createOperation({
        id: randomUUID(),
        sessionId: session.id,
        meterId: session.meterId,
        resourceId: session.resourceId,
        kind,
        status: 'pending',
        requestedAt,
      });
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
                userId,
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
      const done = await this.store.findOperation(operation.id);
      if (!done) throw new Error(`The metering operation ${operation.id} is gone`);
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
    for (const meter of await this.store.listAllMeters()) {
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
        if (await this.store.existsLifecycleAttempt(meter.resourceId)) continue;
        const { byMeter } = await findActiveMeterSessions(this.store, meter.resourceId, [meter.id]);
        const running = (byMeter.get(meter.id) ?? []).flatMap(({ session }) => (session ? [session] : []));
        // A session measured per session is read at its own measuring point; everyone else shares one reading.
        // Each session follows the allocation it captured at its start.
        const own = running.filter((session) => session.accounting === 'per-session');
        const shared = running.filter((session) => session.accounting !== 'per-session');
        const targets = [...own, ...shared.slice(0, 1)];
        this.interimAttempts.set(key, { at: Date.now(), running: true });
        try {
          for (const session of targets.length ? targets : [null])
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

  async setRate(resourceId: number, meterId: number, creditsPerUnit: number, initiatorId?: number) {
    const before = await this.store.findMeter(resourceId, meterId);
    const updated = await this.catalog.setRate(resourceId, meterId, creditsPerUnit);
    if (before && initiatorId !== undefined && before.creditsPerUnit !== creditsPerUnit)
      await this.audit.record({
        domain: 'resource',
        action: 'meter.updated',
        actor: { id: initiatorId, authenticationMethod: 'session' },
        subject: { type: 'resource', id: resourceId },
        details: {
          meterId,
          meterName: before.name,
          'before.creditsPerUnit': before.creditsPerUnit,
          'after.creditsPerUnit': creditsPerUnit,
        },
      });
    return updated;
  }

  /** The rate and allocation are billing terms: every change is recorded. */
  async setAllocation(resourceId: number, meterId: number, allocation: MeterAllocationKind, initiatorId: number) {
    const before = await this.store.findMeter(resourceId, meterId);
    const updated = await this.catalog.setAllocation(resourceId, meterId, allocation);
    if (before && before.allocation !== allocation)
      await this.audit.record({
        domain: 'resource',
        action: 'meter.updated',
        actor: { id: initiatorId, authenticationMethod: 'session' },
        subject: { type: 'resource', id: resourceId },
        details: {
          meterId,
          meterName: before.name,
          'before.allocation': before.allocation,
          'after.allocation': allocation,
        },
      });
    return updated;
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

  waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSessionRecord> {
    return this.settlement.waive(resourceId, sessionId, initiatorId);
  }

  // ---- reconciliation ---------------------------------------------------------------------------

  /** Retries the final collection of a usage that already ended and bills the meter consumption as a separate correction. */
  async retrySettlement(
    resourceId: number,
    sessionId: string,
    initiatorId: number,
  ): Promise<ResourceMeteringSessionRecord> {
    const session = await this.store.findSessionOfResource(resourceId, sessionId);
    if (!session) throw new BadRequestException('METER_SESSION_NOT_FOUND');
    if (session.status !== ResourceMeteringSessionStatus.Pending) {
      throw new ConflictException('METER_SESSION_NOT_PENDING');
    }
    const usage = await this.requireUsage(session.usageId);
    if (!usage.endTime) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const { collect } = await this.getDefinition(resourceId, session.meterId);
    if (session.accounting === 'segmented') return this.retrySegmented(session, usage, collect, initiatorId);
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
      await this.store.updateSession(session.id, { failureReason: reason });
      throw new BadRequestException(`METER_SETTLEMENT_FAILED: ${reason}`);
    }
    return this.requireSession(session.id);
  }

  /**
   * A share of a segment whose closing reading failed is billed once a reading closes the segment. A retry takes
   * that reading now. Whatever closes the segment bills every session that was waiting for it.
   */
  protected async retrySegmented(
    session: ResourceMeteringSessionRecord,
    usage: MeteringUsageRecord,
    collect: { timeoutSeconds: number },
    initiatorId: number,
  ): Promise<ResourceMeteringSessionRecord> {
    try {
      await this.segments.retryClosing(session, usage, collect.timeoutSeconds);
      await this.settlement.settleSegmentedLate(session.id, initiatorId);
    } catch (error) {
      const reason = this.reason(error);
      await this.store.updateSession(session.id, { failureReason: reason });
      throw new BadRequestException(`METER_SETTLEMENT_FAILED: ${reason}`);
    }
    return this.requireSession(session.id);
  }

  /** Removes the metering of a tentative usage that is being rolled back. */
  async discardCandidate(context: TransactionContext, usageId: number): Promise<void> {
    await this.segments.withdraw(context, usageId);
    await this.store.deleteSessionsOfUsage(usageId, context);
  }

  /** A stop that never completed leaves its session running, so it takes part in the open segment again. */
  restoreParticipant(context: TransactionContext, usageId: number): Promise<void> {
    return this.segments.restore(context, usageId);
  }

  /** Runs inside the transaction that ends the usage, before the bill is finalized. Idempotent. */
  settleInTransaction(context: TransactionContext, usageId: number, final: FinalCollection): Promise<void> {
    return this.settlement.settleInTransaction(context, usageId, final);
  }

  protected async collectSessionFinal(session: ResourceMeteringSessionRecord, freshAfter: Date): Promise<MeterFinal> {
    const usageId = session.usageId;
    if (session.compromisedReason) return { status: 'unavailable', reason: session.compromisedReason };
    if (session.accounting === 'segmented') {
      return this.segments.stop(
        session,
        await this.getDefinition(session.resourceId, session.meterId),
        freshAfter,
        (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
      );
    }
    if (session.collectionMode === 'increment') {
      const operation = await this.store.createOperation({
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
    const sessions = await this.store.findRunningSessionsOfUsage(usageId);
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
   *
   * How a meter is set up depends on its allocation (captured by the usage at start). A meter measured per session
   * gives every session its own measuring point. A shared meter on a machine with parallel sessions is read at every
   * start, which closes the segment the running sessions have been sharing; only the first session on an idle
   * machine initializes it.
   */
  async initialize(input: { resourceId: number; usageId: number; supersedes?: number }): Promise<void> {
    const usage = await this.requireUsage(input.usageId);
    const meters =
      usage.meterRates ??
      (await this.store.listMeters(input.resourceId)).map((m) => ({
        meterId: m.id,
        name: m.name,
        creditsPerUnit: m.creditsPerUnit,
        allocation: m.allocation,
      }));
    const initializedMeters = new Set<number>();
    const parallelSessions = (await getMeteringSessionLimit(this.store, input.resourceId)) > 1;
    try {
      for (const meter of meters) {
        const definition = await this.getDefinition(input.resourceId, meter.meterId);
        if (!definition.configured && meter.creditsPerUnit > 0) {
          throw new BadRequestException(`METER_NOT_CONFIGURED: ${meter.name}`, {
            description: definition.problems.join(', '),
          });
        }
        if (!definition.configured) continue;
        const perSession = meter.allocation === 'per-session';
        const values = {
          id: randomUUID(),
          resourceId: input.resourceId,
          usageId: input.usageId,
          meterId: meter.meterId,
          meterName: meter.name,
          status: ResourceMeteringSessionStatus.Active,
          creditsPerUnit: meter.creditsPerUnit,
          accounting: perSession ? ('per-session' as const) : ('own' as const),
          collectionMode: definition.incrementOnly ? ('increment' as const) : ('requested' as const),
          latestValue: definition.incrementOnly ? '0' : null,
        };
        // After a lowered limit, a new session (a takeover) joins the segments of the sessions still sharing it.
        const sharedMachine =
          parallelSessions ||
          (!perSession && (await this.segments.inUseBySegments(input.resourceId, meter.meterId, input)));
        if (!perSession && sharedMachine) {
          if (definition.incrementOnly) {
            // It cannot be read on demand, so its consumption cannot be told apart between sessions.
            const others = await this.segments.otherActiveUsages(input.resourceId, input.usageId, input.supersedes);
            if (others) {
              if (meter.creditsPerUnit > 0)
                // The message carries only the meter name; clients explain the rule in the viewer's language.
                throw new BadRequestException(`METER_SHARING_UNSUPPORTED: ${meter.name}`, {
                  description:
                    'The meter cannot be read on demand, so its consumption cannot be split between sessions running at the same time',
                });
              this.logger.warn(`Skipping tracking-only meter ${meter.meterId}: it cannot be shared`);
              continue;
            }
          } else {
            const started = await this.segments.start(values, definition, input.supersedes);
            if (started?.initialized) {
              initializedMeters.add(meter.meterId);
              await this.invalidateOlderPending(meter.meterId);
            }
            continue;
          }
        }
        const session = await this.store.createSession(values);
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
            await this.store.deleteSession(session.id);
            this.logger.warn(`Skipping tracking-only meter ${meter.meterId}: ${this.reason(error)}`);
            continue;
          }
        }
        // A measuring point of its own restarts nothing that earlier sessions could still be owed from.
        if (!perSession) {
          await this.segments.abandonOpen(undefined, meter.meterId);
          await this.invalidateOlderPending(meter.meterId);
        }
      }
    } catch (error) {
      // A meter read before the failing one already added the session to its open segment.
      await this.segments.withdraw(undefined, input.usageId, input.resourceId);
      await this.store.deleteSessionsOfUsage(input.usageId);
      if (input.supersedes !== undefined && initializedMeters.size)
        await this.store.markOwnSessionsCompromised(
          input.supersedes,
          [...initializedMeters],
          'The meter was re-initialized by a takeover that did not complete',
        );
      if (error instanceof BadRequestException && this.reason(error).startsWith('METER_SHARING_UNSUPPORTED: '))
        throw error;
      throw new BadRequestException(`METER_INITIALIZATION_FAILED: ${this.reason(error)}`);
    }
  }

  /** Increment-only starts have no ready reply to invalidate older pending charges; for requested starts this is an idempotent safeguard. */
  protected invalidateOlderPending(meterId: number): Promise<void> {
    return this.settlement.failOlderPending(meterId);
  }

  // ---- meter definition -------------------------------------------------------------------------

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  getDefinition(resourceId: number, meterId: number) {
    return this.catalog.getDefinition(resourceId, meterId);
  }

  async onModuleInit(): Promise<void> {
    await this.store.expirePendingOperations('Interrupted by a restart');
  }
}

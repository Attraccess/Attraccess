import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ResourceMeterRecord,
  ResourceMeteringOperationRecord,
  ResourceMeteringSessionRecord,
  ResourceMeteringSessionStatus,
} from '@attraccess/application-models';

import type { MeteringReport } from '../flows/node-executors/node-executor.interface';

import type { TransactionContext } from '../../database/transaction-context';
import { UnitOfWork } from '../../database/unit-of-work';

import { requireMeter } from './metering-catalog';

import type { MeteringStore } from './metering-store.port';

import { toMeterValue, MeteringValueError, meterCharge } from './quantity';

import { findActiveMeterSessions, getMeteringSessionLimit } from './meter-sessions';

export const CLOCK_SKEW_MS = 5_000;

export const INTERIM_MAX_AGE_MS = 5 * 60_000;

export class MeteringOperationError extends Error {}

function observationTime(report: Extract<MeteringReport, { kind: 'reading' }>): Date {
  const now = new Date();
  const observedAt = report.observedAt ? new Date(report.observedAt) : now;
  if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > now.getTime() + CLOCK_SKEW_MS)
    throw new MeteringValueError('invalid_observation_time', 'The observation time is invalid or in the future');
  return observedAt;
}

/** The consumption a reading adds since the meter's previous observation. */
function readingDelta(
  meter: ResourceMeterRecord,
  session: ResourceMeteringSessionRecord | null,
  report: Extract<MeteringReport, { kind: 'reading' }>,
): { value: bigint; increment: boolean; previous: bigint | null; delta: bigint } {
  const value = toMeterValue(report.value);
  const increment = report.mode === 'increment';
  // This strategy has no fresh cumulative boundary; a total can include idle consumption.
  // Honor the strategy captured at start even when the flow definition changes mid-session.
  if (session?.collectionMode === 'increment' && !increment)
    throw new MeteringOperationError('An increment-only session requires incremental readings');
  // A session with a measuring point of its own counts from that device's last reading, not from the meter's.
  const previous =
    session?.accounting === 'per-session'
      ? BigInt(session.baselineValue ?? '0') + BigInt(session.latestValue ?? '0')
      : meter.counterValue == null
        ? null
        : BigInt(meter.counterValue);
  if (!increment && previous !== null && value < previous)
    throw new MeteringValueError(
      'counter_decreased',
      'The cumulative counter decreased. Reinitialize its baseline in Metering ready after a reset.',
    );
  const delta = increment ? value : previous === null ? BigInt(0) : value - previous;
  return { value, increment, previous, delta };
}

/** The session's new running total, once it is known to be chargeable. */
function acceptedSessionTotal(session: ResourceMeteringSessionRecord, delta: bigint): bigint {
  const sessionTotal = BigInt(session.latestValue ?? '0') + delta;
  if (sessionTotal < BigInt(0) || sessionTotal < BigInt(session.latestValue ?? '0'))
    throw new MeteringValueError('counter_decreased', 'The session counter decreased');
  if (![ResourceMeteringSessionStatus.Active, ResourceMeteringSessionStatus.Pending].includes(session.status))
    throw new MeteringOperationError('The metering session is closed');
  meterCharge(sessionTotal, session.creditsPerUnit);
  return sessionTotal;
}

export class MeteringReadings {
  public constructor(
    protected readonly store: MeteringStore,
    protected readonly unitOfWork: UnitOfWork,
    protected readonly freshAfter: ReadonlyMap<string, Date>,
  ) {}

  /** Wrong-meter, late and conflicting replies are rejected; repeated completions are idempotent. */
  async complete(operationId: string, report: MeteringReport): Promise<void> {
    await this.unitOfWork.run(async (scope) => {
      const operation = await this.store.findOperation(operationId, scope);
      if (!operation) throw new Error(`The metering operation ${operationId} does not exist`);
      const session = operation.sessionId ? await this.store.findSession(operation.sessionId, scope) : null;
      if (operation.sessionId && !session) throw new Error(`The metering session ${operation.sessionId} is gone`);
      const meter = await requireMeter(this.store, operation.resourceId, operation.meterId, scope);
      if ((operation.kind === 'start') !== (report.kind === 'ready'))
        throw new MeteringOperationError('The reply does not answer this request');
      if (report.kind === 'ready') await this.completeStart(scope, operation, session, meter, report);
      else await this.completeCollection(scope, operation, session, meter, report);
    });
  }

  protected async completeStart(
    scope: TransactionContext,
    operation: ResourceMeteringOperationRecord,
    session: ResourceMeteringSessionRecord | null,
    meter: ResourceMeterRecord,
    report: Extract<MeteringReport, { kind: 'ready' }>,
  ): Promise<void> {
    const baseline = report.baseline ? toMeterValue(report.baseline.value).toString() : '0';
    if (operation.status !== 'pending') {
      if (
        operation.status === 'completed' &&
        session?.baselineValue === baseline &&
        (operation.source ?? null) === (report.source ?? null)
      )
        return;
      throw new MeteringOperationError('The start request was already answered or has expired');
    }
    if (!session) throw new MeteringOperationError('A start request requires a session');
    if (session.accounting === 'per-session') {
      // Only this session's own measuring point restarts; the meter and the other sessions are not touched.
      await this.store.updateSession(
        session.id,
        { baselineValue: baseline, source: report.source ?? session.source },
        scope,
      );
      await this.store.updateOperation(
        operation.id,
        { status: 'completed', completedAt: new Date(), source: report.source ?? null },
        scope,
      );
      return;
    }
    // Baseline readings count consumption since the previous observation, outside this new session.
    const previous = meter.counterValue == null ? null : BigInt(meter.counterValue);
    const delta =
      report.baseline && previous !== null && BigInt(baseline) >= previous ? BigInt(baseline) - previous : BigInt(0);
    // Accepting a new boundary makes older pending charges unrecoverable, even if
    // another start branch later fails and the tracking-only session is removed.
    const superseded = await this.store.findPendingSessionIds(
      meter.id,
      { resourceId: session.resourceId, usageIdBelow: session.usageId, excludeAccounting: ['per-session'] },
      scope,
    );
    if (superseded.length) {
      await this.store.failSessions(superseded, 'The meter was re-initialized for a later session', scope);
    }
    await this.store.recordMeterObservation(
      meter.id,
      {
        counterValue: baseline,
        lifetimeValue: (BigInt(meter.lifetimeValue) + delta).toString(),
        latestObservedAt: new Date(),
      },
      scope,
    );
    await this.store.updateSession(
      session.id,
      { baselineValue: baseline, source: report.source ?? session.source },
      scope,
    );
    await this.store.updateOperation(
      operation.id,
      { status: 'completed', completedAt: new Date(), source: report.source ?? null },
      scope,
    );
  }

  protected async completeCollection(
    scope: TransactionContext,
    operation: ResourceMeteringOperationRecord,
    session: ResourceMeteringSessionRecord | null,
    meter: ResourceMeterRecord,
    report: Extract<MeteringReport, { kind: 'reading' }>,
  ): Promise<void> {
    if (operation.status !== 'pending') {
      if (
        operation.status === 'completed' &&
        operation.reportedValue === toMeterValue(report.value).toString() &&
        operation.readingMode === (report.mode ?? 'total') &&
        this.matchesEvidence(operation, report)
      )
        return;
      throw new MeteringOperationError('The collection was already answered or has expired');
    }
    if (!session) await this.assertIdleCollection(scope, operation, meter);
    else if (session.status === ResourceMeteringSessionStatus.Pending)
      await this.assertEndBoundaryRetry(scope, session, report);
    const freshAfter =
      operation.kind === 'final' || operation.kind === 'boundary'
        ? this.freshAfter.get(operation.id)
        : new Date(operation.requestedAt.getTime() - INTERIM_MAX_AGE_MS);
    const reading = await this.acceptReading(scope, meter, session, report, freshAfter);
    await this.store.updateOperation(
      operation.id,
      {
        status: 'completed',
        completedAt: new Date(),
        totalValue: reading.total,
        observedAt: reading.observedAt,
        source: report.source ?? null,
        reportedValue: toMeterValue(report.value).toString(),
        readingMode: report.mode ?? 'total',
      },
      scope,
    );
  }

  protected async assertIdleCollection(
    scope: TransactionContext,
    operation: ResourceMeteringOperationRecord,
    meter: ResourceMeterRecord,
  ): Promise<void> {
    const { usages } = await findActiveMeterSessions(this.store, operation.resourceId, [meter.id], scope);
    const attempt = await this.store.existsLifecycleAttempt(operation.resourceId, scope);
    // Free meters may skip initialization or lose their session after a failed start.
    // Their fresh lifetime polls are valid while usage stays unchanged, but a
    // reply must not cross a usage boundary or bypass an active meter session.
    const conflictingUsage = await this.store.hasUsageBoundarySince(
      operation.resourceId,
      meter.id,
      operation.requestedAt,
      usages.map((usage) => usage.id),
      scope,
    );
    if (attempt || conflictingUsage) throw new MeteringOperationError('The idle collection crossed a session boundary');
  }

  protected async assertEndBoundaryRetry(
    scope: TransactionContext,
    session: ResourceMeteringSessionRecord,
    report: Extract<MeteringReport, { kind: 'reading' }>,
  ): Promise<void> {
    const usage = await this.store.findUsage(session.usageId, scope);
    if (!usage) throw new Error(`The usage ${session.usageId} does not exist`);
    if (session.accounting === 'segmented') return this.assertSegmentBoundaryRetry(scope, session, report);
    // A current counter cannot distinguish consumption at session end from later idle use.
    // Only a device reading explicitly captured at the persisted end boundary may reconcile it.
    if (!report.observedAt || !usage.endTime || new Date(report.observedAt).getTime() !== usage.endTime.getTime())
      throw new MeteringOperationError('A retry requires a reading captured at the session end boundary');
    await this.assertMeterStillOwned(session, scope);
  }

  /**
   * A segment that nobody is in any more ends when the last of its sessions ended; only a device reading captured
   * at that moment can close it. While a session still runs, a reading is an ordinary boundary.
   */
  protected async assertSegmentBoundaryRetry(
    scope: TransactionContext,
    session: ResourceMeteringSessionRecord,
    report: Extract<MeteringReport, { kind: 'reading' }>,
  ): Promise<void> {
    const open = await this.store.findOpenSegment(session.meterId, scope);
    if (!open) return;
    const usages = await this.store.findUsages(
      open.participants.map((participant) => participant.usageId),
      scope,
    );
    if (usages.some((usage) => usage.endTime === null)) return;
    const lastEnd = Math.max(...usages.map((usage) => usage.endTime?.getTime() ?? 0));
    if (!report.observedAt || new Date(report.observedAt).getTime() !== lastEnd)
      throw new MeteringOperationError('A retry requires a reading captured when the last session ended');
  }

  protected async acceptReading(
    scope: TransactionContext,
    meter: ResourceMeterRecord,
    session: ResourceMeteringSessionRecord | null,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    freshAfter?: Date,
  ): Promise<{ total: string; observedAt: Date }> {
    const observedAt = observationTime(report);
    await this.assertFreshObservation(scope, meter, session, observedAt, freshAfter);
    const { value, increment, delta } = readingDelta(meter, session, report);
    if (!session && delta > BigInt(0)) {
      const invalidated = await this.store.findPendingSessionIds(
        meter.id,
        {
          // A stopped session waiting for its merged segment to close keeps waiting while others still run: the
          // reading falls inside that segment. Only on an idle machine is it idle consumption.
          excludeAccounting: (await this.store.findRunningUsages(meter.resourceId, scope)).length
            ? ['per-session', 'segmented']
            : ['per-session'],
        },
        scope,
      );
      if (invalidated.length) {
        await this.store.failSessions(
          invalidated,
          'The meter advanced outside the ended session; its final consumption can no longer be distinguished from idle consumption',
          scope,
        );
      }
    }
    // Sessions that share the meter have no total of their own: their segments are told apart by boundary readings.
    const sessionTotal = session && session.accounting !== 'segmented' ? acceptedSessionTotal(session, delta) : null;
    await this.store.recordMeterObservation(
      meter.id,
      {
        lifetimeValue: (BigInt(meter.lifetimeValue) + delta).toString(),
        // A measuring point of a session does not move the meter's own counter, which other sessions read.
        ...(session?.accounting === 'per-session'
          ? {}
          : {
              // Keep an established cumulative counter aligned when increments report the same consumption.
              counterValue: increment
                ? meter.counterValue == null
                  ? null
                  : (BigInt(meter.counterValue) + delta).toString()
                : value.toString(),
            }),
        latestObservedAt:
          meter.latestObservedAt && meter.latestObservedAt > observedAt ? meter.latestObservedAt : observedAt,
      },
      scope,
    );
    if (session && sessionTotal !== null)
      await this.store.updateSession(
        session.id,
        {
          latestValue: sessionTotal.toString(),
          latestObservedAt: observedAt,
          source: report.source ?? session.source,
        },
        scope,
      );
    return { total: (sessionTotal ?? value).toString(), observedAt };
  }

  protected async assertFreshObservation(
    scope: TransactionContext,
    meter: ResourceMeterRecord,
    session: ResourceMeteringSessionRecord | null,
    observedAt: Date,
    freshAfter?: Date,
  ): Promise<void> {
    // Increment-only starts do not update the meter's previous observation.
    // Apply the persisted usage boundary before attributing any reading to it.
    const usage = session ? await this.store.findUsage(session.usageId, scope) : null;
    if (session && !usage) throw new Error(`The usage ${session.usageId} does not exist`);
    if (
      (usage && observedAt < usage.startTime) ||
      (freshAfter && observedAt < freshAfter) ||
      (session?.accounting !== 'per-session' && meter.latestObservedAt && observedAt < meter.latestObservedAt) ||
      (session?.accounting === 'per-session' && session.latestObservedAt && observedAt < session.latestObservedAt)
    )
      throw new MeteringValueError(
        'stale_reading',
        'The reading is older than the required boundary or a previously accepted reading',
      );
  }

  protected matchesEvidence(
    operation: ResourceMeteringOperationRecord,
    report: Extract<MeteringReport, { kind: 'reading' }>,
  ): boolean {
    // Omitted timestamps reuse the original server observation on an idempotent retry.
    // Explicit observations and sources must agree with the persisted evidence.
    return (
      (operation.source ?? null) === (report.source ?? null) &&
      (report.observedAt === undefined || new Date(report.observedAt).getTime() === operation.observedAt?.getTime())
    );
  }

  /**
   * A normal flow can report a value without an active usage or collection request. The reading joins the
   * transaction of the caller (a flow run), or commits on its own.
   */
  async report(
    resourceId: number,
    meterId: number,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    context?: TransactionContext,
    lifecycleAttemptId?: string,
    reportId?: string,
    usageId?: number,
  ): Promise<void> {
    const work = async (scope: TransactionContext) => {
      const meter = await requireMeter(this.store, resourceId, meterId, scope);
      const session = await this.findReportSession(scope, resourceId, meter, lifecycleAttemptId, usageId);
      const id = reportId ?? randomUUID();
      const existing = await this.store.findOperation(id, scope);
      if (existing) {
        if (
          existing.meterId === meterId &&
          existing.reportedValue === toMeterValue(report.value).toString() &&
          existing.readingMode === (report.mode ?? 'total') &&
          this.matchesEvidence(existing, report)
        )
          return;
        throw new MeteringOperationError('A conflicting reading was already recorded for this flow node');
      }
      const reading = await this.acceptReading(scope, meter, session, report);
      await this.store.createOperation(
        {
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
          reportedValue: toMeterValue(report.value).toString(),
          readingMode: report.mode ?? 'total',
        },
        scope,
      );
    };
    if (context) await work(context);
    else await this.unitOfWork.run(work);
  }

  /**
   * The meter session a pushed reading belongs to.
   * - A meter measured per session needs the session named: the usage of the lifecycle the flow runs in, or the
   *   usage the Report meter node names. With several active sessions a reading that names none is rejected
   *   rather than guessed; with at most one the reading belongs to that session, as before parallel sessions.
   * - A shared meter's readings belong to the meter: its segments are told apart by boundary readings. Only a
   *   session on its own total (it never overlapped another) takes the reading, and while a lifecycle that may
   *   change who uses the meter is in progress on a machine of one session, the reading is ambiguous.
   */
  protected async findReportSession(
    scope: TransactionContext,
    resourceId: number,
    meter: ResourceMeterRecord,
    lifecycleAttemptId?: string,
    usageId?: number,
  ): Promise<ResourceMeteringSessionRecord | null> {
    const { usages, byMeter } = await findActiveMeterSessions(this.store, resourceId, [meter.id], scope);
    const attempt = lifecycleAttemptId
      ? await this.store.findLifecycleAttempt(lifecycleAttemptId, resourceId, scope)
      : null;
    const ownUsageId = attempt ? (attempt.candidateUsageId ?? attempt.previousUsageId) : null;
    // A takeover's lifecycle belongs to both its incoming and its outgoing session.
    const lifecycleUsageIds = [attempt?.candidateUsageId, attempt?.previousUsageId].filter((id) => id != null);
    const running = (byMeter.get(meter.id) ?? []).flatMap(({ session }) => (session ? [session] : []));
    const sessionOf = (id: number) => this.store.findRunningSession(resourceId, meter.id, id, scope);
    // Each session follows the allocation it captured at its start, not a later change of the meter setting.
    const perSession = running.length
      ? running.some((session) => session.accounting === 'per-session')
      : meter.allocation === 'per-session';
    if (perSession) {
      if (usageId != null && lifecycleUsageIds.length && !lifecycleUsageIds.includes(usageId))
        throw new MeteringOperationError(
          `The usage ID ${usageId} names another session than the one whose lifecycle runs this flow (${ownUsageId})`,
        );
      const named = usageId ?? ownUsageId;
      const session = named == null ? null : await sessionOf(named);
      if (named != null && !session)
        throw new MeteringOperationError(`Session ${named} has no running metering session for this meter`);
      if (session?.accounting === 'per-session') return session;
      if (!session) {
        if (usages.length > 1)
          throw new MeteringOperationError(
            'Several sessions are running and this reading names none of them. Run the flow in a session lifecycle or set the usage ID on the Report meter node.',
          );
        return byMeter.get(meter.id)?.[0]?.session ?? null;
      }
      // The named session shares the meter (it started before the setting changed): the shared rules below apply.
    }
    if ((await getMeteringSessionLimit(this.store, resourceId, scope)) > 1 || usages.length > 1) {
      const only = usages.length === 1 ? byMeter.get(meter.id)?.[0]?.session : null;
      return only?.accounting === 'own' ? only : null;
    }
    // One session at a time: a lifecycle that may change the meter's owner makes the reading ambiguous.
    const busy = await this.store.findAnyLifecycleAttempt(resourceId, scope);
    if (busy && busy.id !== lifecycleAttemptId) throw new ConflictException('METER_LIFECYCLE_BUSY');
    if (!busy) return byMeter.get(meter.id)?.[0]?.session ?? null;
    const usage = busy.candidateUsageId ?? busy.previousUsageId;
    return usage == null ? null : sessionOf(usage);
  }

  async assertMeterStillOwned(session: ResourceMeteringSessionRecord, context?: TransactionContext): Promise<void> {
    if (session.compromisedReason) throw new MeteringOperationError(session.compromisedReason);
    // Sessions with a measuring point of their own, or shared segments, are never taken over by a later session.
    if (session.accounting !== 'own') return;
    if (await this.store.hasLaterSession(session.resourceId, session.meterId, session.usageId, context))
      throw new MeteringOperationError('A later session already uses the meter');
  }
}

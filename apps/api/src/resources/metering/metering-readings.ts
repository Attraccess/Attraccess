import { DatabaseTransactions, TransactionScope } from '../../database/transaction-scope';
import { MeteringPersistence, METERING_OPERATIONS } from './persistence/port';

import {
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
} from '@attraccess/application-models';

import { MeteringReport } from '../flows/node-executors/index';

import { requireMeter, requireMeteringRecord } from './metering-catalog';

import { toMeterValue, MeteringValueError, meterCharge } from './quantity';

import { ConflictException } from '@nestjs/common';

import { randomUUID } from 'node:crypto';
export const CLOCK_SKEW_MS = 5_000;

export const INTERIM_MAX_AGE_MS = 5 * 60_000;

export class MeteringOperationError extends Error {}

export class MeteringReadings {
  public constructor(
    protected readonly persistence: MeteringPersistence,
    protected readonly transactions: DatabaseTransactions,
    protected readonly freshAfter: ReadonlyMap<string, Date>,
  ) {}

  protected bound(scope?: TransactionScope): MeteringPersistence {
    return scope ? scope.resolve(METERING_OPERATIONS) : this.persistence;
  }

  /** Wrong-meter, late and conflicting replies are rejected; repeated completions are idempotent. */
  async complete(operationId: string, report: MeteringReport): Promise<void> {
    const reference = requireMeteringRecord(await this.persistence.operation(operationId), 'operation');
    await this.transactions.run({ resourceIds: [reference.resourceId], accountIds: [] }, async (manager) => {
      const operation = requireMeteringRecord(await this.bound(manager).operation(operationId), 'operation');
      const session = operation.sessionId
        ? requireMeteringRecord(await this.bound(manager).session(operation.sessionId), 'session')
        : null;
      const meter = await requireMeter(this.bound(manager), operation.resourceId, operation.meterId);
      if ((operation.kind === 'start') !== (report.kind === 'ready'))
        throw new MeteringOperationError('The reply does not answer this request');
      if (report.kind === 'ready') {
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
        // Baseline readings count consumption since the previous observation, outside this new session.
        const previous = meter.counterValue == null ? null : BigInt(meter.counterValue);
        const delta =
          report.baseline && previous !== null && BigInt(baseline) >= previous
            ? BigInt(baseline) - previous
            : BigInt(0);
        // Accepting a new boundary makes older pending charges unrecoverable, even if
        // another start branch later fails and the tracking-only session is removed.
        await this.bound(manager).failEarlierPendingSessions(
          session.resourceId,
          meter.id,
          session.usageId,
          'The meter was re-initialized for a later session',
        );
        await this.bound(manager).updateMeterState(meter.id, {
          counterValue: baseline,
          lifetimeValue: (BigInt(meter.lifetimeValue) + delta).toString(),
          latestObservedAt: new Date(),
        });
        await this.bound(manager).updateSession(session.id, {
          baselineValue: baseline,
          source: report.source ?? session.source,
        });
        await this.bound(manager).updateOperation(operation.id, {
          status: 'completed',
          completedAt: new Date(),
          source: report.source ?? null,
        });
        return;
      }
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
      if (!session) {
        const attempt = await this.bound(manager).hasAttempt(operation.resourceId);
        const activeUsage = await this.bound(manager).activeUsage(operation.resourceId);
        // Free meters may skip initialization or lose their session after a failed start.
        // Their fresh lifetime polls are valid while usage stays unchanged, but a
        // reply must not cross a usage boundary or bypass an active meter session.
        const conflictingUsage = await this.bound(manager).conflictingIdleUsage(
          operation.resourceId,
          meter.id,
          operation.requestedAt,
          activeUsage?.id ?? null,
        );
        if (attempt || conflictingUsage)
          throw new MeteringOperationError('The idle collection crossed a session boundary');
      } else if (session.status === ResourceMeteringSessionStatus.Pending) {
        const usage = requireMeteringRecord(await this.bound(manager).usage(session.usageId), 'usage');
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
      await this.bound(manager).updateOperation(operation.id, {
        status: 'completed',
        completedAt: new Date(),
        totalValue: reading.total,
        observedAt: reading.observedAt,
        source: report.source ?? null,
        reportedValue: toMeterValue(report.value).toString(),
        readingMode: report.mode ?? 'total',
      });
    });
  }

  protected async acceptReading(
    manager: TransactionScope,
    meter: ResourceMeter,
    session: ResourceMeteringSession | null,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    freshAfter?: Date,
  ): Promise<{ total: string; observedAt: Date }> {
    const now = new Date();
    const observedAt = report.observedAt ? new Date(report.observedAt) : now;
    if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > now.getTime() + CLOCK_SKEW_MS)
      throw new MeteringValueError('invalid_observation_time', 'The observation time is invalid or in the future');
    // Increment-only starts do not update the meter's previous observation.
    // Apply the persisted usage boundary before attributing any reading to it.
    const usage = session
      ? requireMeteringRecord(await this.bound(manager).usageStart(session.usageId), 'usage')
      : null;
    if (
      (usage && observedAt < usage.startTime) ||
      (freshAfter && observedAt < freshAfter) ||
      (meter.latestObservedAt && observedAt < meter.latestObservedAt)
    )
      throw new MeteringValueError(
        'stale_reading',
        'The reading is older than the required boundary or a previously accepted reading',
      );
    const value = toMeterValue(report.value);
    const increment = report.mode === 'increment';
    // This strategy has no fresh cumulative boundary; a total can include idle consumption.
    // Honor the strategy captured at start even when the flow definition changes mid-session.
    if (session?.collectionMode === 'increment' && !increment)
      throw new MeteringOperationError('An increment-only session requires incremental readings');
    const previous = meter.counterValue == null ? null : BigInt(meter.counterValue);
    if (!increment && previous !== null && value < previous)
      throw new MeteringValueError(
        'counter_decreased',
        'The cumulative counter decreased. Reinitialize its baseline in Metering ready after a reset.',
      );
    const delta = increment ? value : previous === null ? BigInt(0) : value - previous;
    if (!session && delta > BigInt(0))
      await this.bound(manager).failPendingSessions(
        meter.id,
        'The meter advanced outside the ended session; its final consumption can no longer be distinguished from idle consumption',
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
    await this.bound(manager).updateMeterState(meter.id, {
      lifetimeValue: (BigInt(meter.lifetimeValue) + delta).toString(),
      // Keep an established cumulative counter aligned when increments report the same consumption.
      counterValue: increment ? (previous === null ? null : (previous + delta).toString()) : value.toString(),
      latestObservedAt: observedAt,
    });
    if (session && sessionTotal !== null)
      await this.bound(manager).updateSession(session.id, {
        latestValue: sessionTotal.toString(),
        latestObservedAt: observedAt,
        source: report.source ?? session.source,
      });
    return { total: (sessionTotal ?? value).toString(), observedAt };
  }

  protected matchesEvidence(
    operation: ResourceMeteringOperation,
    report: Extract<MeteringReport, { kind: 'reading' }>,
  ): boolean {
    // Omitted timestamps reuse the original server observation on an idempotent retry.
    // Explicit observations and sources must agree with the persisted evidence.
    return (
      (operation.source ?? null) === (report.source ?? null) &&
      (report.observedAt === undefined || new Date(report.observedAt).getTime() === operation.observedAt?.getTime())
    );
  }

  /** A normal flow can report a value without an active usage or collection request. */
  async report(
    resourceId: number,
    meterId: number,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    transactionManager?: TransactionScope,
    lifecycleAttemptId?: string,
    reportId?: string,
  ): Promise<void> {
    const work = async (manager: TransactionScope) => {
      const meter = await requireMeter(this.bound(manager), resourceId, meterId);
      const attempt = await this.bound(manager).attempt(resourceId);
      if (attempt && attempt.id !== lifecycleAttemptId) throw new ConflictException('METER_LIFECYCLE_BUSY');
      const usageId = attempt
        ? (attempt.candidateUsageId ?? attempt.previousUsageId)
        : (await this.bound(manager).activeUsage(resourceId))?.id;
      const session = usageId == null ? null : await this.bound(manager).activeSession(resourceId, meterId, usageId);
      const id = reportId ?? randomUUID();
      const existing = await this.bound(manager).operation(id);
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
      const reading = await this.acceptReading(manager, meter, session, report);
      await this.bound(manager).saveOperation({
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
      });
    };
    await this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, work, transactionManager);
  }

  async assertMeterStillOwned(session: ResourceMeteringSession, manager?: TransactionScope): Promise<void> {
    if (session.compromisedReason) throw new MeteringOperationError(session.compromisedReason);
    const newer = await this.bound(manager).newerSessionCount(session.resourceId, session.meterId, session.usageId);
    if (newer > 0) throw new MeteringOperationError('A later session already uses the meter');
  }
}

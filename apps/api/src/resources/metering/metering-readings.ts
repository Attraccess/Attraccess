import { EntityManager, In, LessThan, MoreThan, Not } from 'typeorm';

import {
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';

import { MeteringReport } from '../flows/node-executors/index';

import { runSerializedTransaction } from '../../database/run-serialized-transaction';

import { requireMeter } from './metering-catalog';

import { toMeterValue, MeteringValueError, meterCharge } from './quantity';

import { findActiveMeterSessions, getMeteringSessionLimit } from './meter-sessions';
import { ConflictException } from '@nestjs/common';

import { randomUUID } from 'node:crypto';
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
  meter: ResourceMeter,
  session: ResourceMeteringSession | null,
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
function acceptedSessionTotal(session: ResourceMeteringSession, delta: bigint): bigint {
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
    protected readonly manager: EntityManager,
    protected readonly freshAfter: ReadonlyMap<string, Date>,
  ) {}

  /** Wrong-meter, late and conflicting replies are rejected; repeated completions are idempotent. */
  async complete(operationId: string, report: MeteringReport): Promise<void> {
    await runSerializedTransaction(this.manager, async (manager) => {
      const operation = await manager.findOneOrFail(ResourceMeteringOperation, { where: { id: operationId } });
      const session = operation.sessionId
        ? await manager.findOneOrFail(ResourceMeteringSession, { where: { id: operation.sessionId } })
        : null;
      const meter = await requireMeter(manager, operation.resourceId, operation.meterId);
      if ((operation.kind === 'start') !== (report.kind === 'ready'))
        throw new MeteringOperationError('The reply does not answer this request');
      if (report.kind === 'ready') await this.completeStart(manager, operation, session, meter, report);
      else await this.completeCollection(manager, operation, session, meter, report);
    });
  }

  protected async completeStart(
    manager: EntityManager,
    operation: ResourceMeteringOperation,
    session: ResourceMeteringSession | null,
    meter: ResourceMeter,
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
    // Baseline readings count consumption since the previous observation, outside this new session.
    const previous = meter.counterValue == null ? null : BigInt(meter.counterValue);
    const delta =
      report.baseline && previous !== null && BigInt(baseline) >= previous ? BigInt(baseline) - previous : BigInt(0);
    // Accepting a new boundary makes older pending charges unrecoverable, even if
    // another start branch later fails and the tracking-only session is removed.
    await manager.update(
      ResourceMeteringSession,
      {
        resourceId: session.resourceId,
        meterId: meter.id,
        usageId: LessThan(session.usageId),
        status: ResourceMeteringSessionStatus.Pending,
        accounting: Not('per-session'),
      },
      {
        status: ResourceMeteringSessionStatus.Failed,
        failureReason: 'The meter was re-initialized for a later session',
      },
    );
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
  }

  protected async completeCollection(
    manager: EntityManager,
    operation: ResourceMeteringOperation,
    session: ResourceMeteringSession | null,
    meter: ResourceMeter,
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
    if (!session) await this.assertIdleCollection(manager, operation, meter);
    else if (session.status === ResourceMeteringSessionStatus.Pending)
      await this.assertEndBoundaryRetry(manager, session, report);
    const freshAfter =
      operation.kind === 'final' || operation.kind === 'boundary'
        ? this.freshAfter.get(operation.id)
        : new Date(operation.requestedAt.getTime() - INTERIM_MAX_AGE_MS);
    const reading = await this.acceptReading(manager, meter, session, report, freshAfter);
    await manager.update(ResourceMeteringOperation, operation.id, {
      status: 'completed',
      completedAt: new Date(),
      totalValue: reading.total,
      observedAt: reading.observedAt,
      source: report.source ?? null,
      reportedValue: toMeterValue(report.value).toString(),
      readingMode: report.mode ?? 'total',
    });
  }

  protected async assertIdleCollection(
    manager: EntityManager,
    operation: ResourceMeteringOperation,
    meter: ResourceMeter,
  ): Promise<void> {
    const { usages } = await findActiveMeterSessions(manager, operation.resourceId, [meter.id]);
    const attempt = await manager.existsBy(ResourceUsageLifecycleAttempt, { resourceId: operation.resourceId });
    // Free meters may skip initialization or lose their session after a failed start.
    // Their fresh lifetime polls are valid while usage stays unchanged, but a
    // reply must not cross a usage boundary or bypass an active meter session.
    const conflictingUsage = await manager
      .createQueryBuilder(ResourceUsage, 'u')
      .leftJoin(ResourceMeteringSession, 's', 's.usageId = u.id AND s.meterId = :meterId', { meterId: meter.id })
      .where('u.resourceId = :resourceId', { resourceId: operation.resourceId })
      .andWhere(
        '(u.startTime >= :requestedAt OR u.endTime >= :requestedAt OR (u.id IN (:...activeUsageIds) AND s.id IS NOT NULL))',
        { requestedAt: operation.requestedAt, activeUsageIds: usages.length ? usages.map((u) => u.id) : [-1] },
      )
      .getExists();
    if (attempt || conflictingUsage) throw new MeteringOperationError('The idle collection crossed a session boundary');
  }

  protected async assertEndBoundaryRetry(
    manager: EntityManager,
    session: ResourceMeteringSession,
    report: Extract<MeteringReport, { kind: 'reading' }>,
  ): Promise<void> {
    const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId } });
    if (session.accounting === 'segmented') return this.assertSegmentBoundaryRetry(manager, session, report);
    // A current counter cannot distinguish consumption at session end from later idle use.
    // Only a device reading explicitly captured at the persisted end boundary may reconcile it.
    if (!report.observedAt || !usage.endTime || new Date(report.observedAt).getTime() !== usage.endTime.getTime())
      throw new MeteringOperationError('A retry requires a reading captured at the session end boundary');
    await this.assertMeterStillOwned(session, manager);
  }

  /**
   * A segment that nobody is in any more ends when the last of its sessions ended; only a device reading captured
   * at that moment can close it. While a session still runs, a reading is an ordinary boundary.
   */
  protected async assertSegmentBoundaryRetry(
    manager: EntityManager,
    session: ResourceMeteringSession,
    report: Extract<MeteringReport, { kind: 'reading' }>,
  ): Promise<void> {
    const open = await manager.findOne(ResourceMeteringSegment, { where: { meterId: session.meterId, status: 'open' } });
    if (!open) return;
    const usages = await manager.find(ResourceUsage, {
      where: { id: In(open.participants.map((participant) => participant.usageId)) },
      select: { id: true, endTime: true },
    });
    if (usages.some((usage) => usage.endTime === null)) return;
    const lastEnd = Math.max(...usages.map((usage) => usage.endTime?.getTime() ?? 0));
    if (!report.observedAt || new Date(report.observedAt).getTime() !== lastEnd)
      throw new MeteringOperationError('A retry requires a reading captured when the last session ended');
  }

  protected async acceptReading(
    manager: EntityManager,
    meter: ResourceMeter,
    session: ResourceMeteringSession | null,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    freshAfter?: Date,
  ): Promise<{ total: string; observedAt: Date }> {
    const observedAt = observationTime(report);
    await this.assertFreshObservation(manager, meter, session, observedAt, freshAfter);
    const { value, increment, delta } = readingDelta(meter, session, report);
    if (!session && delta > BigInt(0))
      await manager.update(
        ResourceMeteringSession,
        { meterId: meter.id, status: ResourceMeteringSessionStatus.Pending, accounting: Not('per-session') },
        {
          status: ResourceMeteringSessionStatus.Failed,
          failureReason:
            'The meter advanced outside the ended session; its final consumption can no longer be distinguished from idle consumption',
        },
      );
    // Sessions that share the meter have no total of their own: their segments are told apart by boundary readings.
    const sessionTotal = session && session.accounting !== 'segmented' ? acceptedSessionTotal(session, delta) : null;
    await manager.update(ResourceMeter, meter.id, {
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
      latestObservedAt: meter.latestObservedAt && meter.latestObservedAt > observedAt ? meter.latestObservedAt : observedAt,
    });
    if (session && sessionTotal !== null)
      await manager.update(ResourceMeteringSession, session.id, {
        latestValue: sessionTotal.toString(),
        latestObservedAt: observedAt,
        source: report.source ?? session.source,
      });
    return { total: (sessionTotal ?? value).toString(), observedAt };
  }

  protected async assertFreshObservation(
    manager: EntityManager,
    meter: ResourceMeter,
    session: ResourceMeteringSession | null,
    observedAt: Date,
    freshAfter?: Date,
  ): Promise<void> {
    // Increment-only starts do not update the meter's previous observation.
    // Apply the persisted usage boundary before attributing any reading to it.
    const usage = session
      ? await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId }, select: { startTime: true } })
      : null;
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
    transactionManager?: EntityManager,
    lifecycleAttemptId?: string,
    reportId?: string,
    usageId?: number,
  ): Promise<void> {
    const work = async (manager: EntityManager) => {
      const meter = await requireMeter(manager, resourceId, meterId);
      const session = await this.findReportSession(manager, resourceId, meter, lifecycleAttemptId, usageId);
      const id = reportId ?? randomUUID();
      const existing = await manager.findOne(ResourceMeteringOperation, { where: { id } });
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
        reportedValue: toMeterValue(report.value).toString(),
        readingMode: report.mode ?? 'total',
      });
    };
    if (transactionManager) await work(transactionManager);
    else await runSerializedTransaction(this.manager, work);
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
    manager: EntityManager,
    resourceId: number,
    meter: ResourceMeter,
    lifecycleAttemptId?: string,
    usageId?: number,
  ): Promise<ResourceMeteringSession | null> {
    const { usages, byMeter } = await findActiveMeterSessions(manager, resourceId, [meter.id]);
    const attempt = lifecycleAttemptId
      ? await manager.findOne(ResourceUsageLifecycleAttempt, { where: { id: lifecycleAttemptId, resourceId } })
      : null;
    const ownUsageId = attempt ? (attempt.candidateUsageId ?? attempt.previousUsageId) : null;
    const sessionOf = (id: number) =>
      manager.findOne(ResourceMeteringSession, {
        where: { resourceId, meterId: meter.id, usageId: id, status: ResourceMeteringSessionStatus.Active },
      });
    if (meter.allocation === 'per-session') {
      const named = usageId ?? ownUsageId;
      if (named != null) {
        const session = await sessionOf(named);
        if (!session) throw new MeteringOperationError(`Session ${named} has no running metering session for this meter`);
        return session;
      }
      if (usages.length > 1)
        throw new MeteringOperationError(
          'Several sessions are running and this reading names none of them. Run the flow in a session lifecycle or set the usage ID on the Report meter node.',
        );
      return byMeter.get(meter.id)?.[0]?.session ?? null;
    }
    if ((await getMeteringSessionLimit(manager, resourceId)) > 1 || usages.length > 1) {
      const only = usages.length === 1 ? byMeter.get(meter.id)?.[0]?.session : null;
      return only?.accounting === 'own' ? only : null;
    }
    // One session at a time: a lifecycle that may change the meter's owner makes the reading ambiguous.
    const busy = await manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId } });
    if (busy && busy.id !== lifecycleAttemptId) throw new ConflictException('METER_LIFECYCLE_BUSY');
    if (!busy) return byMeter.get(meter.id)?.[0]?.session ?? null;
    const usage = busy.candidateUsageId ?? busy.previousUsageId;
    return usage == null ? null : sessionOf(usage);
  }

  async assertMeterStillOwned(session: ResourceMeteringSession, manager = this.manager): Promise<void> {
    if (session.compromisedReason) throw new MeteringOperationError(session.compromisedReason);
    // Sessions with a measuring point of their own, or shared segments, are never taken over by a later session.
    if (session.accounting !== 'own') return;
    const newer = await manager.count(ResourceMeteringSession, {
      where: { resourceId: session.resourceId, meterId: session.meterId, usageId: MoreThan(session.usageId) },
    });
    if (newer > 0) throw new MeteringOperationError('A later session already uses the meter');
  }
}

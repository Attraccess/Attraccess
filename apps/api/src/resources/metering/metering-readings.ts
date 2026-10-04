import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, MoreThan } from 'typeorm';
import {
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import type { MeteringReport } from '../flows/node-executors';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { requireMeter } from './metering-catalog';
import { MeteringValueError, meterCharge, toMeterValue } from './quantity';

const CLOCK_SKEW_MS = 5_000;
const INTERIM_MAX_AGE_MS = 5 * 60_000;

export class MeteringOperationError extends Error {}

/** Validates readings and atomically attributes them to lifetime and session totals. */
export class MeteringReadings {
  constructor(
    private readonly manager: EntityManager,
    private readonly freshAfter: ReadonlyMap<string, Date>,
  ) {}

  async assertMeterStillOwned(session: ResourceMeteringSession, manager = this.manager): Promise<void> {
    if (session.compromisedReason) throw new MeteringOperationError(session.compromisedReason);
    const newer = await manager.count(ResourceMeteringSession, {
      where: { resourceId: session.resourceId, meterId: session.meterId, usageId: MoreThan(session.usageId) },
    });
    if (newer > 0) throw new MeteringOperationError('A later session already uses the meter');
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
      const meter = await requireMeter(manager, resourceId, meterId);
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
          existing.reportedValue === toMeterValue(report.value).toString() &&
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
        reportedValue: toMeterValue(report.value).toString(),
        readingMode: report.mode ?? 'total',
      });
    };
    if (transactionManager) await work(transactionManager);
    else await runSerializedTransaction(this.manager, work);
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
    const value = toMeterValue(report.value);
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
  async complete(operationId: string, report: MeteringReport): Promise<void> {
    await runSerializedTransaction(this.manager, async (manager) => {
      const operation = await manager.findOneOrFail(ResourceMeteringOperation, { where: { id: operationId } });
      const session = operation.sessionId
        ? await manager.findOneOrFail(ResourceMeteringSession, { where: { id: operation.sessionId } })
        : null;
      const meter = await requireMeter(manager, operation.resourceId, operation.meterId);
      if ((operation.kind === 'start') !== (report.kind === 'ready'))
        throw new MeteringOperationError('The reply does not answer this request');
      if (report.kind === 'ready') {
        const baseline = report.baseline ? toMeterValue(report.baseline.value).toString() : '0';
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
          operation.reportedValue === toMeterValue(report.value).toString() &&
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
        reportedValue: toMeterValue(report.value).toString(),
        readingMode: report.mode ?? 'total',
      });
    });
  }
}

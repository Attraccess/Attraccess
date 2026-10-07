import { EntityManager } from 'typeorm';
import {
  ResourceMeter,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { MeteringReport } from '../flows/node-executors';
import { MeteringValueError, meterCharge, toMeterValue } from './quantity';
import { MeteringReadingsMatchesEvidenceOperation } from './metering-readings.metering-readings-matches-evidence-operation';
import { CLOCK_SKEW_MS } from './metering-reading.constants';
import { MeteringOperationError } from './metering-reading.constants';

export abstract class MeteringReadingsAcceptReadingOperation extends MeteringReadingsMatchesEvidenceOperation {
  protected async acceptReading(
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
    // Increment-only starts do not update the meter's previous observation.
    // Apply the persisted usage boundary before attributing any reading to it.
    const usage = session
      ? await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId }, select: { startTime: true } })
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
}

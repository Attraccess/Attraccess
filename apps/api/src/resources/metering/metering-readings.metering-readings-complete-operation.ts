import { LessThan } from 'typeorm';
import {
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { MeteringReport } from '../flows/node-executors';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { requireMeter } from './metering-catalog';
import { toMeterValue } from './quantity';
import { findActiveUsage } from '../usage/active-usage';
import { MeteringReadingsAcceptReadingOperation } from './metering-readings.metering-readings-accept-reading-operation';
import { INTERIM_MAX_AGE_MS } from './metering-reading.constants';
import { MeteringOperationError } from './metering-reading.constants';

export abstract class MeteringReadingsCompleteOperation extends MeteringReadingsAcceptReadingOperation {
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
        await manager.update(
          ResourceMeteringSession,
          {
            resourceId: session.resourceId,
            meterId: meter.id,
            usageId: LessThan(session.usageId),
            status: ResourceMeteringSessionStatus.Pending,
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
        const attempt = await manager.existsBy(ResourceUsageLifecycleAttempt, { resourceId: operation.resourceId });
        const activeUsage = await findActiveUsage(manager, operation.resourceId);
        // Free meters may skip initialization or lose their session after a failed start.
        // Their fresh lifetime polls are valid while usage stays unchanged, but a
        // reply must not cross a usage boundary or bypass an active meter session.
        const conflictingUsage = await manager
          .createQueryBuilder(ResourceUsage, 'u')
          .leftJoin(ResourceMeteringSession, 's', 's.usageId = u.id AND s.meterId = :meterId', { meterId: meter.id })
          .where('u.resourceId = :resourceId', { resourceId: operation.resourceId })
          .andWhere(
            '(u.startTime >= :requestedAt OR u.endTime >= :requestedAt OR (u.id = :activeUsageId AND s.id IS NOT NULL))',
            { requestedAt: operation.requestedAt, activeUsageId: activeUsage?.id ?? null },
          )
          .getExists();
        if (attempt || conflictingUsage)
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

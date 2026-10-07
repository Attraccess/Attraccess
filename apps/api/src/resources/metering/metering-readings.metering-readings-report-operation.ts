import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import {
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { MeteringReport } from '../flows/node-executors';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { requireMeter } from './metering-catalog';
import { toMeterValue } from './quantity';
import { findActiveUsage } from '../usage/active-usage';
import { MeteringReadingsAssertMeterStillOwnedOperation } from './metering-readings.metering-readings-assert-meter-still-owned-operation';
import { MeteringOperationError } from './metering-reading.constants';

export abstract class MeteringReadingsReportOperation extends MeteringReadingsAssertMeterStillOwnedOperation {
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
      const usageId = attempt
        ? (attempt.candidateUsageId ?? attempt.previousUsageId)
        : (await findActiveUsage(manager, resourceId))?.id;
      const session =
        usageId == null
          ? null
          : await manager.findOne(ResourceMeteringSession, {
              where: { resourceId, meterId, usageId, status: ResourceMeteringSessionStatus.Active },
            });
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
}

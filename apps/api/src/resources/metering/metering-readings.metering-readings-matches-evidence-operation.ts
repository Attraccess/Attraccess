import { ResourceMeteringOperation } from '@attraccess/database-entities';
import { MeteringReport } from '../flows/node-executors';
import { MeteringReadingsReportOperation } from './metering-readings.metering-readings-report-operation';
export abstract class MeteringReadingsMatchesEvidenceOperation extends MeteringReadingsReportOperation {
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
}

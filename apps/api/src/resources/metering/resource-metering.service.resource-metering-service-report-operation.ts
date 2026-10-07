import { EntityManager } from 'typeorm';
import { MeteringReport } from '../flows/node-executors';
import { ResourceMeteringServiceCloseOperation } from './resource-metering.service.resource-metering-service-close-operation';
export abstract class ResourceMeteringServiceReportOperation extends ResourceMeteringServiceCloseOperation {
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
}

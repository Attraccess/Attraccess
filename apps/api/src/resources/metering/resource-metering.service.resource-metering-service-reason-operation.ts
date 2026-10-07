import { ResourceMeteringServiceReportOperation } from './resource-metering.service.resource-metering-service-report-operation';
export abstract class ResourceMeteringServiceReasonOperation extends ResourceMeteringServiceReportOperation {
  protected reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

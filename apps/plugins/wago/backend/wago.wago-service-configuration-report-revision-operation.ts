import { WagoServiceProcessConfigurationReportsOperation } from './wago.wago-service-process-configuration-reports-operation';


export abstract class WagoServiceConfigurationReportRevisionOperation extends WagoServiceProcessConfigurationReportsOperation {
  protected configurationReportRevision(payload: Buffer): number | null {
    try {
      const report = JSON.parse(payload.toString('utf8')) as { revision?: unknown };
      return Number.isSafeInteger(report.revision) && (report.revision as number) >= 1
        ? (report.revision as number)
        : null;
    } catch {
      return null;
    }
  }
}

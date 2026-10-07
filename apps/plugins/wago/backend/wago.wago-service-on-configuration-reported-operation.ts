import { parseConfigurationReport } from './configuration';
import { WagoServiceWatchClaimAcknowledgementOperation } from './wago.wago-service-watch-claim-acknowledgement-operation';


export abstract class WagoServiceOnConfigurationReportedOperation extends WagoServiceWatchClaimAcknowledgementOperation {
  protected async onConfigurationReported(controllerId: number, payload: Buffer): Promise<void> {
    let report: ReturnType<typeof parseConfigurationReport>;
    try {
      report = parseConfigurationReport(JSON.parse(payload.toString('utf8')));
    } catch {
      this.context.logger.warn(`Ignoring invalid WAGO configuration report for controller ${controllerId}`);
      return;
    }
    if (!report) {
      this.context.logger.warn(`Ignoring malformed WAGO configuration report for controller ${controllerId}`);
      return;
    }
    await this.withConfigurationLock(controllerId, async () => {
      const revision = await this.revisions.findOneBy({ controllerId, revision: report.revision });
      if (!revision || revision.contentHash !== report.contentHash) return;
      if (revision.state !== 'published') return;
      revision.state = report.errors.length ? 'rejected' : 'applied';
      revision.rejectionErrors = report.errors.length ? JSON.stringify(report.errors) : null;
      revision.reportedAt = new Date().toISOString();
      await this.revisions.save(revision);
    });
  }
}

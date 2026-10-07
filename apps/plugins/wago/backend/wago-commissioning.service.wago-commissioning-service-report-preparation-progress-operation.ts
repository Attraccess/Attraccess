import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import {
  commissioningCheckpoints,
  type CommissioningCheckpoint,
} from './wago-commissioning-progress';
import { WagoCommissioningServiceReportTransferProgressOperation } from "./wago-commissioning.service.wago-commissioning-service-report-transfer-progress-operation";
export abstract class WagoCommissioningServiceReportPreparationProgressOperation extends WagoCommissioningServiceReportTransferProgressOperation {


  protected reportPreparationProgress(session: WagoCommissioningSession, checkpoint: CommissioningCheckpoint): void {
    const [percent, step, detail] = commissioningCheckpoints[checkpoint];
    if (session.progressStep === step) return;
    const updatedAt = new Date().toISOString();
    session.progressPercent = percent;
    session.progressStep = step;
    session.progressDetail = detail;
    const audit = JSON.parse(session.auditLog) as Array<{ at: string; event: string }>;
    audit.push({ at: updatedAt, event: `progress: ${step}` });
    session.auditLog = JSON.stringify(audit.slice(-50));
    session.updatedAt = updatedAt;
    const update = {
      progressPercent: percent,
      progressStep: step,
      progressDetail: detail,
      updatedAt,
      auditLog: session.auditLog,
    };
    const write = (this.transferWrites.get(session.id) ?? Promise.resolve())
      .then(async () => {
        await this.operationContext.getStore()?.assertOwned();
        await this.sessions.update(session.id, update);
      })
      .catch(() => this.context.logger?.warn('Could not update WAGO controller preparation progress.'));
    this.transferWrites.set(session.id, write);
    void write.then(() => {
      if (this.transferWrites.get(session.id) === write) this.transferWrites.delete(session.id);
    });
  }
}

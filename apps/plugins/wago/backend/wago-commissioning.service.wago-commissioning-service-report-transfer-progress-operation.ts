import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningServiceUpdateProgressOperation } from "./wago-commissioning.service.wago-commissioning-service-update-progress-operation";
export abstract class WagoCommissioningServiceReportTransferProgressOperation extends WagoCommissioningServiceUpdateProgressOperation {


  protected reportTransferProgress(session: WagoCommissioningSession, percent: number): void {
    const progressPercent = 55 + Math.round((percent * 15) / 100);
    session.progressPercent = progressPercent;
    session.progressStep = 'Transferring runtime';
    session.progressDetail = `Uploading runtime bundle: ${percent}%.`;
    const update = {
      progressPercent,
      progressStep: session.progressStep,
      progressDetail: session.progressDetail,
      updatedAt: new Date().toISOString(),
    };
    const write = (this.transferWrites.get(session.id) ?? Promise.resolve())
      .then(async () => {
        await this.operationContext.getStore()?.assertOwned();
        await this.sessions.update(session.id, update);
      })
      .catch(() => this.context.logger?.warn('Could not update WAGO runtime transfer progress.'));
    this.transferWrites.set(session.id, write);
    void write.then(() => {
      if (this.transferWrites.get(session.id) === write) this.transferWrites.delete(session.id);
    });
  }
}

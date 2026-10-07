import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningServiceSaveOperation } from "./wago-commissioning.service.wago-commissioning-service-save-operation";
export abstract class WagoCommissioningServiceUpdateProgressOperation extends WagoCommissioningServiceSaveOperation {


  protected async updateProgress(
    session: WagoCommissioningSession,
    percent: number,
    step: string,
    detail: string,
  ): Promise<void> {
    session.progressPercent = percent;
    session.progressStep = step;
    session.progressDetail = detail;
    await this.save(session, `progress: ${step}`);
  }
}

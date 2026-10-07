import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningServiceCopyToOperation } from "./wago-commissioning.service.wago-commissioning-service-copy-to-operation";
export abstract class WagoCommissioningServiceSaveOperation extends WagoCommissioningServiceCopyToOperation {


  protected async save(session: WagoCommissioningSession, event: string): Promise<WagoCommissioningSession> {
    await this.operationContext.getStore()?.assertOwned();
    const audit = JSON.parse(session.auditLog) as Array<{ at: string; event: string }>;
    audit.push({ at: new Date().toISOString(), event });
    session.auditLog = JSON.stringify(audit.slice(-50));
    session.updatedAt = new Date().toISOString();
    return this.sessions.save(session);
  }
}

import { WagoCommissioningServiceRecoverSessionsOperation } from "./wago-commissioning.service.wago-commissioning-service-recover-sessions-operation";
export abstract class WagoCommissioningServiceReconcileCompletedSessionsOperation extends WagoCommissioningServiceRecoverSessionsOperation {


  protected async reconcileCompletedSessions(): Promise<void> {
    for (let skip = 0; ; skip += 100) {
      const page = await this.sessions.find({ where: { state: 'completed' }, order: { id: 'ASC' }, take: 100, skip });
      for (const session of page) {
        if (session.state === 'completed')
          await this.withControllerLock(session.id, () =>
            this.retireSupersededSessions(session.hardwareId, session.id),
          );
      }
      if (page.length < 100) break;
    }
  }
}

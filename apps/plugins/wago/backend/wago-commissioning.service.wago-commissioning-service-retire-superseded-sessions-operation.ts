import { WagoCommissioningServiceReconcileCompletedSessionsOperation } from "./wago-commissioning.service.wago-commissioning-service-reconcile-completed-sessions-operation";
export abstract class WagoCommissioningServiceRetireSupersededSessionsOperation extends WagoCommissioningServiceReconcileCompletedSessionsOperation {


  protected async retireSupersededSessions(hardwareId: string, completedSessionId: number): Promise<void> {
    for (let skip = 0; ; skip += 100) {
      const sessions = await this.sessions.find({ where: { hardwareId }, order: { id: 'ASC' }, take: 100, skip });
      await Promise.all(
        sessions
          .filter(
            (session) =>
              session.id !== completedSessionId && session.state !== 'completed' && session.state !== 'revoked',
          )
          .map((session) =>
            this.withDeliveryLock(session.id, async () => {
              const current = await this.sessions.findOneBy({ id: session.id });
              if (!current || current.state === 'completed' || current.state === 'revoked') return;
              await this.revokeSessionEnrollment(current);
              current.state = 'revoked';
              current.pairingCode = null;
              current.failureReason = null;
              current.progressStep = 'Superseded by completed commissioning';
              current.progressDetail = 'A newer commissioning session claimed this controller.';
              await this.save(current, 'superseded_by_completed_session');
            }),
          ),
      );
      if (sessions.length < 100) break;
    }
  }
}

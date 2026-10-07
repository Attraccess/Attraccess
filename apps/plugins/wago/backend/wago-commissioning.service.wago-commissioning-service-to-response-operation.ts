import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { WagoCommissioningServiceRetireSupersededSessionsOperation } from "./wago-commissioning.service.wago-commissioning-service-retire-superseded-sessions-operation";
export abstract class WagoCommissioningServiceToResponseOperation extends WagoCommissioningServiceRetireSupersededSessionsOperation {


  protected async toResponse(session: WagoCommissioningSession): Promise<CommissioningSessionResponse> {
    const {
      pairingCode: _pairingCode,
      deliveryToken: _deliveryToken,
      initiatingPrincipal: _principal,
      dockerProvisionToken: _dockerToken,
      ...response
    } = session;
    void _pairingCode;
    void _deliveryToken;
    void _principal;
    void _dockerToken;
    const deadline = this.activeDeadlines.get(session.id);
    return {
      ...response,
      operationDeadlineAt: deadline === undefined ? null : new Date(deadline).toISOString(),
      ...(_deliveryToken ? { runtimeRecoveryAvailable: true } : {}),
      ...((await this.managedRuntime?.hasAccess(session.id)) ? { managedAccessAvailable: true } : {}),
    };
  }
}

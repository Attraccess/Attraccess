import { auditCommissioning, CommissioningPrincipal } from './wago-commissioning-audit';
import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { DeliveryInput } from "./wago-commissioning.service.delivery-input";
import { WagoCommissioningServiceAssertCurrentRuntimeBundleOperation } from "./wago-commissioning.service.wago-commissioning-service-assert-current-runtime-bundle-operation";
export abstract class WagoCommissioningServiceRecoverOperation extends WagoCommissioningServiceAssertCurrentRuntimeBundleOperation {


  async recover(
    id: number,
    input: DeliveryInput = {},
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    return auditCommissioning(
      this.context,
      principal,
      id,
      'recover',
      () => this.recoverWhileAudited(id, input),
      (result) => result.failureReason === null && ['delivery_failed', 'revoked'].includes(result.state),
    );
  }
}

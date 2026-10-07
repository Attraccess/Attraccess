import { auditCommissioning, CommissioningPrincipal } from './wago-commissioning-audit';
import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { DeliveryInput } from "./wago-commissioning.service.delivery-input";
import { WagoCommissioningServiceVerifyManagementKeyOperation } from "./wago-commissioning.service.wago-commissioning-service-verify-management-key-operation";
export abstract class WagoCommissioningServiceDeliverOperation extends WagoCommissioningServiceVerifyManagementKeyOperation {


  async deliver(
    id: number,
    input: DeliveryInput = {},
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    return auditCommissioning(
      this.context,
      principal,
      id,
      'install',
      () =>
        this.withControllerLock(id, () =>
          this.withDeliveryLock(id, () => this.deliverWhileLocked(id, input, principal)),
        ),
      (result) => result.state === 'awaiting_discovery',
    );
  }
}

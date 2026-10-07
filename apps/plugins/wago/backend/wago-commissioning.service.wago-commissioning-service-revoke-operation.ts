import {
  NotFoundException
} from '@nestjs/common';
import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { WagoCommissioningServiceWithControllerLockOperation } from "./wago-commissioning.service.wago-commissioning-service-with-controller-lock-operation";
export abstract class WagoCommissioningServiceRevokeOperation extends WagoCommissioningServiceWithControllerLockOperation {


  async revoke(id: number): Promise<CommissioningSessionResponse> {
    return this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        await this.revokeSessionEnrollment(session);
        session.state = 'revoked';
        session.pairingCode = null;
        session.failureReason = null;
        return this.toResponse(await this.save(session, 'revoked'));
      }),
    );
  }
}

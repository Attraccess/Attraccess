import {
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { CommissioningSessionResponse } from "./wago-commissioning.service.commissioning-session-response";
import { WagoCommissioningServiceCreateOperation } from "./wago-commissioning.service.wago-commissioning-service-create-operation";
export abstract class WagoCommissioningServiceConfirmHostKeyOperation extends WagoCommissioningServiceCreateOperation {


  async confirmHostKey(
    id: number,
    hostKeyFingerprint: string,
    trustMethod: 'trusted_inventory' | 'isolated_service_connection' = 'trusted_inventory',
    physicalIdentityConfirmed = false,
  ): Promise<CommissioningSessionResponse> {
    if (
      !['trusted_inventory', 'isolated_service_connection'].includes(trustMethod) ||
      (trustMethod === 'isolated_service_connection' && physicalIdentityConfirmed !== true)
    )
      throw new ConflictException('Confirm the isolated service connection and physical controller identity.');
    return this.withDeliveryLock(id, async () => {
      const session = await this.sessions.findOneBy({ id });
      if (!session) throw new NotFoundException('commissioning session not found');
      if (session.state !== 'awaiting_identity_confirmation')
        throw new ConflictException('commissioning session identity cannot be confirmed in its current state');
      if (hostKeyFingerprint !== session.hostKeyFingerprint)
        throw new ConflictException(
          'the supplied SSH host-key fingerprint does not match the scanned controller identity',
        );

      session.state = 'awaiting_delivery';
      session.progressPercent = 0;
      session.progressStep = 'Identity confirmed';
      session.progressDetail =
        trustMethod === 'trusted_inventory'
          ? 'The administrator compared the SSH host key with an independent trusted record.'
          : 'The operator confirmed a physically isolated service connection. This is first-key pinning on that connection, not independent cryptographic device authentication.';
      return this.toResponse(await this.save(session, `host_key_confirmed_${trustMethod}`));
    });
  }
}

import {
  ConflictException
} from '@nestjs/common';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoManagedRuntimeServiceHasAccessOperation } from './wago-managed-runtime.wago-managed-runtime-service-has-access-operation';
export abstract class WagoManagedRuntimeServiceCommissioningRecoveryPasswordOperation extends WagoManagedRuntimeServiceHasAccessOperation {


  /** Used only inside an audited commissioning recovery and its device lock.
   * A failed FW31 preflight may leave the factory password unchanged, so prove
   * the encrypted recovery login before selecting it. Never disclose it to UI.
   */
  async commissioningRecoveryPassword(session: WagoCommissioningSession): Promise<string | null> {
    const access = await this.loadSession(session.id);
    if (!access || !this.rootProbe || !['pending', 'verified', 'recovery_required'].includes(access.state)) return null;
    const credentials = this.credentials(access);
    if (
      access.host !== session.targetHost ||
      access.fingerprint !== session.hostKeyFingerprint ||
      credentials.hardwareId !== session.hardwareId
    )
      throw new ConflictException('Managed recovery identity changed; check the saved controller identity.');
    return (await this.rootProbe(access.host, access.fingerprint, credentials.recoveryPassword))
      ? credentials.recoveryPassword
      : null;
  }
}

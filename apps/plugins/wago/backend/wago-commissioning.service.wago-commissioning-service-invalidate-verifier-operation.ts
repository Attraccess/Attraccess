import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningServiceRevokeSessionEnrollmentOperation } from "./wago-commissioning.service.wago-commissioning-service-revoke-session-enrollment-operation";
export abstract class WagoCommissioningServiceInvalidateVerifierOperation extends WagoCommissioningServiceRevokeSessionEnrollmentOperation {


  protected async invalidateVerifier(session: WagoCommissioningSession): Promise<void> {
    // Persist the claim block before calling a broker which may be unavailable.
    session.state = 'revoked';
    session.pairingCode = null;
    session.progressStep = 'Commissioning session revoked';
    session.progressDetail = 'The saved verifier is unavailable. Create a new commissioning session.';
    session.failureReason = 'Commissioning verifier is unavailable; credential revocation requires attention.';
    await this.save(session, 'verifier_invalidated');
    await this.revokeSessionEnrollment(session);
    session.failureReason = null;
    await this.save(session, 'invalid_verifier_revoked');
  }
}

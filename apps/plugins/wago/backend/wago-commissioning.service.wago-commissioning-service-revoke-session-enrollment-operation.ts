import {
  ConflictException
} from '@nestjs/common';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningServiceDecryptVerifierOperation } from "./wago-commissioning.service.wago-commissioning-service-decrypt-verifier-operation";
export abstract class WagoCommissioningServiceRevokeSessionEnrollmentOperation extends WagoCommissioningServiceDecryptVerifierOperation {


  protected async revokeSessionEnrollment(session: WagoCommissioningSession): Promise<void> {
    if (session.enrollmentId == null) return;
    await this.operationContext.getStore()?.assertOwned();
    try {
      await this.wago.revokeEnrollmentById(session.enrollmentId, this.operationContext.getStore()?.assertOwned);
    } catch {
      throw new ConflictException('Commissioning credential revocation requires attention.');
    }
    session.enrollmentId = null;
    session.enrollmentExpiresAt = null;
    await this.save(session, 'enrollment_revoked');
  }
}

import { WagoCommissioningTimeoutError } from './wago-commissioning-progress';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { CommissioningSessionResponse } from './wago-commissioning.service.commissioning-session-response';
import {
  RuntimeReleaseChangedError,
  WagoControllerLockError,
  WagoRuntimeUploadError,
  WagoStorageCapacityError,
} from './wago-commissioning.service.errors';
import { DeliveryAttempt } from './wago-delivery-attempt';
import { WagoManagedProvisioningError } from './wago-managed-provisioning-error';

import { WagoDeliveryTransfer } from './wago-delivery-transfer';
export abstract class WagoDeliveryFailure extends WagoDeliveryTransfer {
  protected async failDelivery(
    session: WagoCommissioningSession,
    error: unknown,
    attempt: DeliveryAttempt,
  ): Promise<CommissioningSessionResponse> {
    await this.transferWrites.get(session.id);
    if (
      error instanceof WagoCommissioningTimeoutError ||
      error instanceof WagoRuntimeUploadError ||
      error instanceof RuntimeReleaseChangedError ||
      error instanceof WagoStorageCapacityError ||
      error instanceof WagoControllerLockError ||
      error instanceof WagoManagedProvisioningError
    )
      attempt.safeFailure = error.message;
    if (attempt.credentialsTouched && session.enrollmentId !== null) {
      try {
        await this.revokeSessionEnrollment(session);
      } catch {
        session.state = 'delivery_failed';
        session.enrollmentExpiresAt = null;
        session.progressStep = 'Delivery failed';
        session.progressDetail = 'Credential revocation requires attention before delivery can be retried.';
        session.failureReason = 'Delivery failed; bootstrap credential revocation requires attention.';
        return this.toResponse(await this.save(session, 'enrollment_revocation_failed'));
      }
    }
    session.state = 'delivery_failed';
    session.enrollmentExpiresAt = null;
    session.progressStep = 'Delivery failed';
    session.progressDetail =
      error instanceof WagoManagedProvisioningError && !session.deliveryToken && !session.dockerProvisionToken
        ? 'No controller preparation started. Correct the managed SSH prerequisite and retry installation.'
        : error instanceof WagoStorageCapacityError
          ? 'Free space on the CC100, then retry installation.'
          : error instanceof WagoControllerLockError
            ? 'The CC100 was busy. No preparation started; retry installation.'
            : 'Review the blocker. Clean up any interrupted preparation or runtime installation before retrying. Cleanup will not restore CODESYS or previous workloads.';
    session.failureReason = attempt.safeFailure;
    return this.toResponse(await this.save(session, 'delivery_failed'));
  }
}

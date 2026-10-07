import { WagoEnrollment } from './wago-enrollment.entity';
import { ENROLLMENT_RETRY_MS } from './wago.state';
import { WagoServiceIsActiveEnrollmentOperation } from './wago.wago-service-is-active-enrollment-operation';


export abstract class WagoServiceScheduleEnrollmentExpiryOperation extends WagoServiceIsActiveEnrollmentOperation {
  protected scheduleEnrollmentExpiry(
    enrollment: WagoEnrollment,
    delay = Date.parse(enrollment.expiresAt) - Date.now(),
  ): void {
    if (enrollment.consumedAt) return;
    const existing = this.enrollmentExpiryTimers.get(enrollment.id);
    if (existing) clearTimeout(existing);
    this.enrollmentExpiryTimers.set(
      enrollment.id,
      setTimeout(
        () => {
          this.enrollmentExpiryTimers.delete(enrollment.id);
          if (this.destroyed) return;
          void this.revokeEnrollment(enrollment)
            .then(() => this.subscribeConfiguredServers())
            .catch((error) => {
              this.context.logger.warn(`Could not revoke expired WAGO enrollment ${enrollment.id}: ${String(error)}`);
              if (!enrollment.consumedAt) this.scheduleEnrollmentExpiry(enrollment, ENROLLMENT_RETRY_MS);
              this.scheduleSubscriptionRetry();
            });
        },
        Math.max(0, delay),
      ),
    );
  }
}

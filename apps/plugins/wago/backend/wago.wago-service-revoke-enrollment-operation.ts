import { ConflictException } from '@nestjs/common';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoServiceScheduleEnrollmentExpiryOperation } from './wago.wago-service-schedule-enrollment-expiry-operation';


export abstract class WagoServiceRevokeEnrollmentOperation extends WagoServiceScheduleEnrollmentExpiryOperation {
  protected async revokeEnrollment(
    enrollment: WagoEnrollment,
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<void> {
    if (!enrollment.revokedAt) {
      await assertOwned();
      const manual = await this.context.getMqttCredentialProvisioning().revoke({
        mqttServerId: enrollment.mqttServerId,
        identity: enrollment.identity,
        username: enrollment.identity,
        vhost: '/',
      });
      if (manual)
        throw new ConflictException(`Manual credential revocation is required: ${manual.instructions.join(' ')}`);
      await assertOwned();
      enrollment.revokedAt = new Date().toISOString();
      await this.enrollments.save(enrollment);
    }
    await assertOwned();
    enrollment.consumedAt = new Date().toISOString();
    await this.enrollments.save(enrollment);
    const timer = this.enrollmentExpiryTimers.get(enrollment.id);
    if (timer) clearTimeout(timer);
    this.enrollmentExpiryTimers.delete(enrollment.id);
    this.clearClaimAcknowledgement(enrollment.id);
  }
}

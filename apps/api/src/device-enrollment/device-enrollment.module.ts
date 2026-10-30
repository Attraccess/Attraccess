import { Module } from '@nestjs/common';
import { EnrollmentLimitsService } from './enrollment-limits.service';

/** Device-neutral parts of enrollment by admin approval: code format, client address and limits. */
@Module({
  providers: [EnrollmentLimitsService],
  exports: [EnrollmentLimitsService],
})
export class DeviceEnrollmentModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeviceEnrollmentController } from './device-enrollment.controller';
import { DeviceEnrollmentService } from './device-enrollment.service';

@Module({
  imports: [AuditModule],
  controllers: [DeviceEnrollmentController],
  providers: [DeviceEnrollmentService],
  exports: [DeviceEnrollmentService],
})
export class DeviceEnrollmentModule {}

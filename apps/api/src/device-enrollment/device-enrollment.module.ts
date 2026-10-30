import { Module } from '@nestjs/common';
import { DeviceEnrollmentController } from './device-enrollment.controller';
import { DeviceEnrollmentService } from './device-enrollment.service';

@Module({
  controllers: [DeviceEnrollmentController],
  providers: [DeviceEnrollmentService],
  exports: [DeviceEnrollmentService],
})
export class DeviceEnrollmentModule {}

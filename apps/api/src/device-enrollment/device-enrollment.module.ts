import { AuditModule } from '../audit/audit.module';
import { Module } from '@nestjs/common';
import { DeviceEnrollmentService } from './device-enrollment.service';
@Module({ imports: [AuditModule], providers: [DeviceEnrollmentService], exports: [DeviceEnrollmentService] })
export class DeviceEnrollmentModule {}

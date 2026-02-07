import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  Resource,
  ResourceIntroducer,
  ResourceUsage,
} from '@attraccess/database-entities';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceController } from './maintenance.controller';
import { CanManageMaintenanceGuard } from './canManageMaintenance.guard';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceMaintenance,
      ResourceMaintenanceSchedule,
      ResourceMaintenanceScheduleUsageHoursConfig,
      ResourceMaintenanceScheduleUsageCountConfig,
      ResourceMaintenanceScheduleTimeIntervalConfig,
      Resource,
      ResourceIntroducer,
      ResourceUsage,
    ]),
  ],
  controllers: [ResourceMaintenanceController],
  providers: [ResourceMaintenanceService, CanManageMaintenanceGuard, MaintenanceScheduleEvaluatorService],
  exports: [ResourceMaintenanceService],
})
export class ResourceMaintenanceModule { }

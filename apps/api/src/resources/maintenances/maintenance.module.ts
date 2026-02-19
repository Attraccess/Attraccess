/**
 * Resource maintenance: manual and schedule-triggered maintenances.
 * Manual maintenances record the creating user (createdByUser). Completed maintenances
 * record the user who marked them done (completedByUser) and when (completedAt).
 * System-created (schedule-triggered) maintenances have no creator until completed by a user.
 */
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
import { MaintenanceScheduleService } from './maintenance-schedule.service';
import { MaintenanceScheduleController } from './maintenance-schedule.controller';

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
  controllers: [ResourceMaintenanceController, MaintenanceScheduleController],
  providers: [
    ResourceMaintenanceService,
    CanManageMaintenanceGuard,
    MaintenanceScheduleEvaluatorService,
    MaintenanceScheduleService,
  ],
  exports: [ResourceMaintenanceService],
})
export class ResourceMaintenanceModule { }

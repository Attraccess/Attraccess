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
  ResourceMaintenanceRequest,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  Resource,
  ResourceIntroducer,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceController } from './maintenance.controller';
import { CanManageMaintenanceGuard } from './canManageMaintenance.guard';
import { MaintenanceScheduleEvaluatorService } from './maintenance-schedule-evaluator.service';
import { MaintenanceScheduleService } from './maintenance-schedule.service';
import { MaintenanceScheduleController } from './maintenance-schedule.controller';
import { MaintenanceRequestService } from './maintenance-request.service';
import { MaintenanceRequestController } from './maintenance-request.controller';
import { MaintenanceRequestNotificationListener } from './maintenance-request-notification.listener';
import { NotificationsModule } from '../../notifications/notifications.module';
import { LicenseModule } from '../../license/license.module';
import { RbacModule } from '../../users-and-auth/rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceMaintenance,
      ResourceMaintenanceRequest,
      ResourceMaintenanceSchedule,
      ResourceMaintenanceScheduleUsageHoursConfig,
      ResourceMaintenanceScheduleUsageCountConfig,
      ResourceMaintenanceScheduleTimeIntervalConfig,
      Resource,
      ResourceIntroducer,
      ResourceUsage,
      User,
    ]),
    NotificationsModule,
    LicenseModule,
    RbacModule,
  ],
  controllers: [ResourceMaintenanceController, MaintenanceScheduleController, MaintenanceRequestController],
  providers: [
    ResourceMaintenanceService,
    CanManageMaintenanceGuard,
    MaintenanceScheduleEvaluatorService,
    MaintenanceScheduleService,
    MaintenanceRequestService,
    MaintenanceRequestNotificationListener,
  ],
  exports: [ResourceMaintenanceService, CanManageMaintenanceGuard, MaintenanceRequestService],
})
export class ResourceMaintenanceModule { }

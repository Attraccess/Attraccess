import { MaintenanceEvaluationPersistence, MAINTENANCE_EVALUATION_OPERATIONS } from './persistence/port';
import { TypeormMaintenanceEvaluationPersistence } from './persistence/typeorm-adapter';
import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { MaintenancePersistence, MAINTENANCE_OPERATIONS } from './persistence/port';
import { TypeormMaintenancePersistence } from './persistence/typeorm-adapter';
import {
  MaintenanceRequestRecipients,
  MaintenanceRequestPersistence,
  MaintenanceSchedulePersistence,
} from './persistence/port';
import {
  TypeormMaintenanceRequestPersistence,
  TypeormMaintenanceRequestRecipients,
  TypeormMaintenanceSchedulePersistence,
} from './persistence/typeorm-adapter';
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
import { ResourceOperatingAttributionModule } from '../operating-intervals/resource-operating-attribution.module';

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
    ResourceOperatingAttributionModule,
    NotificationsModule,
    LicenseModule,
    RbacModule,
  ],
  controllers: [ResourceMaintenanceController, MaintenanceScheduleController, MaintenanceRequestController],
  providers: [
    {
      provide: MaintenanceEvaluationPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(
          MAINTENANCE_EVALUATION_OPERATIONS,
          (manager) => new TypeormMaintenanceEvaluationPersistence(manager),
        );
        return new TypeormMaintenanceEvaluationPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    {
      provide: MaintenancePersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(MAINTENANCE_OPERATIONS, (manager) => new TypeormMaintenancePersistence(manager));
        return new TypeormMaintenancePersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    ResourceMaintenanceService,
    CanManageMaintenanceGuard,
    MaintenanceScheduleEvaluatorService,
    MaintenanceScheduleService,
    { provide: MaintenanceSchedulePersistence, useClass: TypeormMaintenanceSchedulePersistence },
    MaintenanceRequestService,
    { provide: MaintenanceRequestPersistence, useClass: TypeormMaintenanceRequestPersistence },
    MaintenanceRequestNotificationListener,
    { provide: MaintenanceRequestRecipients, useClass: TypeormMaintenanceRequestRecipients },
  ],
  exports: [ResourceMaintenanceService, CanManageMaintenanceGuard, MaintenanceRequestService],
})
export class ResourceMaintenanceModule {}

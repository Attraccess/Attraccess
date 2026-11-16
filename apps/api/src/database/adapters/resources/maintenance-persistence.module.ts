import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Resource,
  ResourceIntroducer,
  ResourceMaintenance,
  ResourceMaintenanceRequest,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { RESOURCE_MAINTENANCE_STORE } from '../../../resources/maintenances/maintenance-store.port';
import {
  MAINTENANCE_NOTIFICATION_STORE,
  MAINTENANCE_REQUEST_STORE,
} from '../../../resources/maintenances/maintenance-request-store.port';
import { MAINTENANCE_SCHEDULE_STORE } from '../../../resources/maintenances/maintenance-schedule-store.port';
import { TypeOrmResourceMaintenanceStore } from './maintenance-store.adapter';
import {
  TypeOrmMaintenanceNotificationStore,
  TypeOrmMaintenanceRequestStore,
} from './maintenance-request-store.adapter';
import { TypeOrmResourceRecipientStore } from './resource-recipient-store.adapter';
import { TypeOrmMaintenanceScheduleStore } from './maintenance-schedule-store.adapter';

/**
 * TypeORM-backed implementations of the maintenance ports. The repositories of the schedule evaluator are exported
 * too, until the evaluator (which reads usage history with engine-specific SQL) moves behind a port of its own.
 */
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
  ],
  providers: [
    TypeOrmResourceRecipientStore,
    { provide: RESOURCE_MAINTENANCE_STORE, useClass: TypeOrmResourceMaintenanceStore },
    { provide: MAINTENANCE_REQUEST_STORE, useClass: TypeOrmMaintenanceRequestStore },
    { provide: MAINTENANCE_NOTIFICATION_STORE, useClass: TypeOrmMaintenanceNotificationStore },
    { provide: MAINTENANCE_SCHEDULE_STORE, useClass: TypeOrmMaintenanceScheduleStore },
  ],
  exports: [
    TypeOrmModule,
    RESOURCE_MAINTENANCE_STORE,
    MAINTENANCE_REQUEST_STORE,
    MAINTENANCE_NOTIFICATION_STORE,
    MAINTENANCE_SCHEDULE_STORE,
  ],
})
export class MaintenancePersistenceModule {}

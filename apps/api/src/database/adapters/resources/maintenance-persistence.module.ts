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
import { MAINTENANCE_EVALUATION_STORE } from '../../../resources/maintenances/maintenance-evaluation-store.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmResourceMaintenanceStore } from './maintenance-store.adapter';
import {
  TypeOrmMaintenanceNotificationStore,
  TypeOrmMaintenanceRequestStore,
} from './maintenance-request-store.adapter';
import { TypeOrmResourceRecipientStore } from './resource-recipient-store.adapter';
import { TypeOrmMaintenanceScheduleStore } from './maintenance-schedule-store.adapter';
import { TypeOrmMaintenanceEvaluationStore } from './maintenance-evaluation-store.adapter';

/**
 * TypeORM-backed implementations of the maintenance ports, among them the evaluation store of the schedule
 * evaluator (engine-specific SQL and the read-only snapshot connection).
 */
@Module({
  imports: [
    UnitOfWorkModule,
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
    { provide: MAINTENANCE_EVALUATION_STORE, useClass: TypeOrmMaintenanceEvaluationStore },
  ],
  exports: [
    TypeOrmModule,
    RESOURCE_MAINTENANCE_STORE,
    MAINTENANCE_REQUEST_STORE,
    MAINTENANCE_NOTIFICATION_STORE,
    MAINTENANCE_SCHEDULE_STORE,
    MAINTENANCE_EVALUATION_STORE,
  ],
})
export class MaintenancePersistenceModule {}

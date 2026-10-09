import type { DataSource } from 'typeorm';
import {
  MaintenanceRequestStatus,
  Resource,
  ResourceHealthSource,
  ResourceHealthState,
  ResourceHealthStatus,
  ResourceMaintenance,
  ResourceMaintenanceRequest,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleUsageHoursConfig,
  UsageDurationUnit,
  User,
} from '@attraccess/database-entities';
import { ensureEntity } from '../seed-storage.test-fixture';
export async function migrationMaintenanceSeeds(
  dataSource: DataSource,
  seedTag: string,
  primaryUser: User,
  resource: Resource,
) {
  const resourceMaintenanceRepo = dataSource.getRepository(ResourceMaintenance);

  const maintenanceScheduleRepo = dataSource.getRepository(ResourceMaintenanceSchedule);

  const maintenanceScheduleUsageHoursConfigRepo = dataSource.getRepository(ResourceMaintenanceScheduleUsageHoursConfig);

  const maintenanceScheduleUsageCountConfigRepo = dataSource.getRepository(ResourceMaintenanceScheduleUsageCountConfig);

  const maintenanceScheduleTimeIntervalConfigRepo = dataSource.getRepository(
    ResourceMaintenanceScheduleTimeIntervalConfig,
  );

  const resourceMaintenanceRequestRepo = dataSource.getRepository(ResourceMaintenanceRequest);

  const resourceHealthRepo = dataSource.getRepository(ResourceHealthState);

  await ensureEntity(resourceMaintenanceRepo, () => ({
    resourceId: resource.id,
    startTime: new Date(),
    endTime: null,
    reason: 'Seed maintenance',
  }));

  await ensureEntity(resourceMaintenanceRequestRepo, () => ({
    resourceId: resource.id,
    reason: 'Seed maintenance request',
    status: MaintenanceRequestStatus.OPEN,
    createdByUser: { id: primaryUser.id },
    resolvedByUser: null,
    resolvedAt: null,
    resultingMaintenance: null,
  }));

  await ensureEntity(resourceHealthRepo, () => ({
    resourceId: resource.id,
    identifier: 'Seed source',
    status: ResourceHealthStatus.UNHEALTHY,
    reason: 'Seed unhealthy state',
    source: ResourceHealthSource.MANUAL,
    lastReportedAt: new Date(),
  }));

  const scheduleUsageHours = await ensureEntity(maintenanceScheduleRepo, () => ({
    resourceId: resource.id,
    name: `Seed schedule hours ${seedTag}`,
    triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
    enabled: true,
  }));

  await ensureEntity(maintenanceScheduleUsageHoursConfigRepo, () => ({
    scheduleId: scheduleUsageHours.id,
    duration: 10,
    unit: UsageDurationUnit.HOURS,
  }));

  const scheduleUsageCount = await ensureEntity(maintenanceScheduleRepo, () => ({
    resourceId: resource.id,
    name: `Seed schedule count ${seedTag}`,
    triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    enabled: true,
  }));

  await ensureEntity(maintenanceScheduleUsageCountConfigRepo, () => ({
    scheduleId: scheduleUsageCount.id,
    thresholdSessions: 50,
  }));

  const scheduleTimeInterval = await ensureEntity(maintenanceScheduleRepo, () => ({
    resourceId: resource.id,
    name: `Seed schedule interval ${seedTag}`,
    triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
    enabled: true,
  }));

  await ensureEntity(maintenanceScheduleTimeIntervalConfigRepo, () => ({
    scheduleId: scheduleTimeInterval.id,
    duration: 500,
    unit: UsageDurationUnit.HOURS,
  }));
}

import type {
  MaintenanceScheduleRecord,
  ResourceActorUser,
  ResourceMaintenanceRecord,
  ResourceMaintenanceRequestRecord,
} from '@attraccess/application-models';
import type { ResourceActorUserDto } from './resource-actor-user.dto';
import type {
  ResourceMaintenance,
  ResourceMaintenanceRequest,
  ResourceMaintenanceSchedule,
} from './maintenance-records.dto';

/** Copies exactly the response fields; nothing that is not named here can reach the client. */
export function toActorUserDto(user: ResourceActorUser | null | undefined): ResourceActorUserDto | null | undefined {
  if (!user) return user;
  return {
    id: user.id,
    username: user.username,
    locale: user.locale,
    dateTimeLocale: user.dateTimeLocale,
    isEmailVerified: user.isEmailVerified,
    isDisabled: user.isDisabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
    externalIdentifier: user.externalIdentifier,
    creditBalance: user.creditBalance,
    billingFactor: user.billingFactor,
  };
}

export function toMaintenanceDto(record: ResourceMaintenanceRecord): ResourceMaintenance {
  const dto: ResourceMaintenance = {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resourceId: record.resourceId,
    startTime: record.startTime,
    endTime: record.endTime,
    reason: record.reason,
    completedAt: record.completedAt,
  };
  if (record.createdByUser !== undefined) dto.createdByUser = toActorUserDto(record.createdByUser);
  if (record.completedByUser !== undefined) dto.completedByUser = toActorUserDto(record.completedByUser);
  return dto;
}

export function toMaintenanceRequestDto(record: ResourceMaintenanceRequestRecord): ResourceMaintenanceRequest {
  const dto: ResourceMaintenanceRequest = {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resourceId: record.resourceId,
    reason: record.reason,
    status: record.status,
    resolvedAt: record.resolvedAt,
  };
  if (record.createdByUser !== undefined) dto.createdByUser = toActorUserDto(record.createdByUser);
  if (record.resolvedByUser !== undefined) dto.resolvedByUser = toActorUserDto(record.resolvedByUser);
  if (record.resultingMaintenance !== undefined) {
    dto.resultingMaintenance = record.resultingMaintenance ? toMaintenanceDto(record.resultingMaintenance) : null;
  }
  return dto;
}

/** Keeps `undefined` (relation not loaded) and `null` (no config) apart from a mapped value. */
const mapConfig = <T, R>(config: T | null | undefined, map: (config: T) => R): R | null | undefined =>
  config ? map(config) : (config as null | undefined);

export function toMaintenanceScheduleDto(record: MaintenanceScheduleRecord): ResourceMaintenanceSchedule {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resourceId: record.resourceId,
    name: record.name,
    triggerType: record.triggerType,
    durationBasis: record.durationBasis,
    enabled: record.enabled,
    usageHoursConfig: mapConfig(record.usageHoursConfig, (c) => ({
      id: c.id,
      scheduleId: c.scheduleId,
      duration: c.duration,
      unit: c.unit,
    })),
    usageCountConfig: mapConfig(record.usageCountConfig, (c) => ({
      id: c.id,
      scheduleId: c.scheduleId,
      thresholdSessions: c.thresholdSessions,
    })),
    timeIntervalConfig: mapConfig(record.timeIntervalConfig, (c) => ({
      id: c.id,
      scheduleId: c.scheduleId,
      duration: c.duration,
      unit: c.unit,
    })),
  };
}

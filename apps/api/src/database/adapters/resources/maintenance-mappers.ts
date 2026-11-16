import type {
  MaintenanceScheduleRecord,
  ResourceActorUser,
  ResourceMaintenanceRecord,
  ResourceMaintenanceRequestRecord,
  ResourceNotificationRecipient,
} from '@attraccess/application-models';
import type {
  ResourceMaintenance,
  ResourceMaintenanceRequest,
  ResourceMaintenanceSchedule,
  User,
} from '@attraccess/database-entities';

export function toActorUser(user: User | null | undefined): ResourceActorUser | null | undefined {
  if (user === undefined) return undefined;
  if (user === null) return null;
  return {
    id: user.id,
    username: user.username,
    locale: user.locale,
    dateTimeLocale: user.dateTimeLocale,
    isEmailVerified: user.isEmailVerified,
    isDisabled: user.isDisabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    // A loaded, not deleted user has null here; an entity that never loaded the column has undefined.
    deletedAt: user.deletedAt ?? null,
    externalIdentifier: user.externalIdentifier,
    creditBalance: user.creditBalance,
    billingFactor: user.billingFactor,
  };
}

export function toNotificationRecipient(user: User): ResourceNotificationRecipient {
  return { id: user.id, username: user.username, email: user.email, locale: user.locale };
}

export function toMaintenanceRecord(entity: ResourceMaintenance): ResourceMaintenanceRecord {
  const record: ResourceMaintenanceRecord = {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    resourceId: entity.resourceId,
    startTime: entity.startTime,
    endTime: entity.endTime,
    reason: entity.reason,
    completedAt: entity.completedAt,
  };
  if (entity.createdByUser !== undefined) record.createdByUser = toActorUser(entity.createdByUser);
  if (entity.completedByUser !== undefined) record.completedByUser = toActorUser(entity.completedByUser);
  return record;
}

export function toMaintenanceRequestRecord(entity: ResourceMaintenanceRequest): ResourceMaintenanceRequestRecord {
  const record: ResourceMaintenanceRequestRecord = {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    resourceId: entity.resourceId,
    reason: entity.reason,
    status: entity.status,
    resolvedAt: entity.resolvedAt,
  };
  if (entity.createdByUser !== undefined) record.createdByUser = toActorUser(entity.createdByUser);
  if (entity.resolvedByUser !== undefined) record.resolvedByUser = toActorUser(entity.resolvedByUser);
  if (entity.resultingMaintenance !== undefined) {
    record.resultingMaintenance = entity.resultingMaintenance ? toMaintenanceRecord(entity.resultingMaintenance) : null;
  }
  return record;
}

export function toMaintenanceScheduleRecord(entity: ResourceMaintenanceSchedule): MaintenanceScheduleRecord {
  const record: MaintenanceScheduleRecord = {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    resourceId: entity.resourceId,
    name: entity.name,
    triggerType: entity.triggerType,
    durationBasis: entity.durationBasis,
    enabled: entity.enabled,
  };
  const { usageHoursConfig: hours, usageCountConfig: count, timeIntervalConfig: interval } = entity;
  if (hours !== undefined) {
    record.usageHoursConfig = hours && {
      id: hours.id,
      scheduleId: hours.scheduleId,
      duration: hours.duration,
      unit: hours.unit,
    };
  }
  if (count !== undefined) {
    record.usageCountConfig = count && {
      id: count.id,
      scheduleId: count.scheduleId,
      thresholdSessions: count.thresholdSessions,
    };
  }
  if (interval !== undefined) {
    record.timeIntervalConfig = interval && {
      id: interval.id,
      scheduleId: interval.scheduleId,
      duration: interval.duration,
      unit: interval.unit,
    };
  }
  return record;
}

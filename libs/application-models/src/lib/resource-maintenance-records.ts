import type { MaintenanceRequestStatus } from './resource-maintenance-request';
import type {
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
} from './resource-maintenance-schedule';
import type { UsageDurationUnit } from './usage-duration-unit';
import type { ResourceActorUser } from './resource-actor-user';

export interface ResourceMaintenanceRecord {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  startTime: Date;
  endTime: Date | null;
  reason: string | null;
  completedAt: Date | null;
  /** Present when the read asked for the audit users. */
  createdByUser?: ResourceActorUser | null;
  completedByUser?: ResourceActorUser | null;
}

export interface ResourceMaintenanceRequestRecord {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  reason: string;
  status: MaintenanceRequestStatus;
  resolvedAt: Date | null;
  createdByUser?: ResourceActorUser | null;
  resolvedByUser?: ResourceActorUser | null;
  resultingMaintenance?: ResourceMaintenanceRecord | null;
}

interface MaintenanceDurationConfigRecord {
  id: number;
  scheduleId: number;
  duration: number;
  unit: UsageDurationUnit;
}

interface MaintenanceUsageCountConfigRecord {
  id: number;
  scheduleId: number;
  thresholdSessions: number;
}

export interface MaintenanceScheduleRecord {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  name: string | null;
  triggerType: ResourceMaintenanceScheduleTriggerType;
  durationBasis: ResourceMaintenanceScheduleDurationBasis;
  enabled: boolean;
  usageHoursConfig?: MaintenanceDurationConfigRecord | null;
  usageCountConfig?: MaintenanceUsageCountConfigRecord | null;
  timeIntervalConfig?: MaintenanceDurationConfigRecord | null;
}

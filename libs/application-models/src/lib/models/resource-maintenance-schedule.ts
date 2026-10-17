import { Resource } from './resource';
import { ResourceMaintenanceScheduleUsageHoursConfig } from './resource-maintenance-schedule-usage-hours-config';
import { ResourceMaintenanceScheduleUsageCountConfig } from './resource-maintenance-schedule-usage-count-config';
import { ResourceMaintenanceScheduleTimeIntervalConfig } from './resource-maintenance-schedule-time-interval-config';

export enum ResourceMaintenanceScheduleTriggerType {
  USAGE_HOURS = 'USAGE_HOURS',
  USAGE_COUNT = 'USAGE_COUNT',
  /** Recurring (e.g. every N days) or one-off wall-clock threshold (e.g. after N hours since baseline). */
  TIME_INTERVAL = 'TIME_INTERVAL',
}

export enum ResourceMaintenanceScheduleDurationBasis {
  SESSION_DURATION = 'SESSION_DURATION',
  /** All machine operation, including unattributed time. Keep the legacy storage/API value. */
  ATTRIBUTABLE_OPERATING_DURATION = 'ATTRIBUTABLE_OPERATING_DURATION',
}

export interface ResourceMaintenanceSchedule {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  resourceId: number;
  resource: Resource;
  name: string | null;
  triggerType: ResourceMaintenanceScheduleTriggerType;
  durationBasis: ResourceMaintenanceScheduleDurationBasis;
  usageHoursConfig?: ResourceMaintenanceScheduleUsageHoursConfig | null;
  usageCountConfig?: ResourceMaintenanceScheduleUsageCountConfig | null;
  timeIntervalConfig?: ResourceMaintenanceScheduleTimeIntervalConfig | null;
  enabled: boolean;
}

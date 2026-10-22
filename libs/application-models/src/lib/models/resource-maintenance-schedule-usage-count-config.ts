import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule';

/**
 * Config for USAGE_COUNT trigger. Baseline is always the end of the last maintenance
 * created by this schedule (when that maintenance was marked done).
 */
export interface ResourceMaintenanceScheduleUsageCountConfig {
  id: number;
  scheduleId: number;
  schedule: ResourceMaintenanceSchedule;
  thresholdSessions: number;
}

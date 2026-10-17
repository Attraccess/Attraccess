import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule';
import { UsageDurationUnit } from '../types/usageDurationUnit.enum';

/**
 * Config for USAGE_HOURS trigger. Baseline is always the end of the last maintenance
 * created by this schedule (when that maintenance was marked done).
 */
export interface ResourceMaintenanceScheduleUsageHoursConfig {
  id: number;
  scheduleId: number;
  schedule: ResourceMaintenanceSchedule;
  duration: number;
  unit: UsageDurationUnit;
}

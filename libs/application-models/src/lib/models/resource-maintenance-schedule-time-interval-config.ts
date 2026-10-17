import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule';
import { UsageDurationUnit } from '../types/usageDurationUnit.enum';

/**
 * Config for TIME_INTERVAL trigger. Uses duration + unit (same as USAGE_HOURS).
 * Trigger after N duration (in unit) has passed since baseline (wall-clock).
 * Baseline = when last maintenance for this schedule was done.
 */
export interface ResourceMaintenanceScheduleTimeIntervalConfig {
  id: number;
  scheduleId: number;
  schedule: ResourceMaintenanceSchedule;
  duration: number;
  unit: UsageDurationUnit;
}

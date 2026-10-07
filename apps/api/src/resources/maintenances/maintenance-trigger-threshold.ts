import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { ResourceDurations } from '../operating-intervals/resource-operating-attribution.service';
import { MaintenanceEvaluationQueriesImplementation } from './maintenance-evaluation-queries';
export abstract class MaintenanceTriggerThresholdImplementation extends MaintenanceEvaluationQueriesImplementation {
  /**
   * Convert duration + unit to exact milliseconds (for usage threshold comparison).
   */
  protected durationToMs(duration: number, unit: UsageDurationUnit): number {
    switch (unit) {
      case UsageDurationUnit.MINUTES:
        return duration * 60_000;
      case UsageDurationUnit.HOURS:
        return duration * 60 * 60_000;
      case UsageDurationUnit.DAYS:
        return duration * 24 * 60 * 60_000;
      default:
        return duration * 60_000;
    }
  }

  /**
   * Pure comparison: given pre-fetched usage numbers and elapsed time, returns true if the schedule
   * threshold is met. Both individual and bulk evaluation delegate here so the
   * switch-on-triggerType logic lives in exactly one place.
   */
  protected evaluateTriggerThreshold(
    schedule: ResourceMaintenanceSchedule,
    baseline: Date,
    now: Date,
    durationMs: number,
    usageCount: number,
  ): boolean {
    switch (schedule.triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
        const config = schedule.usageHoursConfig;
        if (!config) return false;
        return durationMs >= this.durationToMs(config.duration, config.unit);
      }
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT: {
        const config = schedule.usageCountConfig;
        if (!config) return false;
        return usageCount >= config.thresholdSessions;
      }
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
        const config = schedule.timeIntervalConfig;
        if (!config) return false;
        const elapsedMs = now.getTime() - baseline.getTime();
        return elapsedMs >= this.durationToMs(config.duration, config.unit);
      }
      default:
        return false;
    }
  }

  /**
   * Returns true if the schedule's condition is met.
   */
  async shouldTrigger(
    schedule: ResourceMaintenanceSchedule,
    resourceId: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const baseline = await this.getBaselineDate(resourceId, schedule.id, manager);
    const now = new Date();
    let durationMs = 0;
    let usageCount = 0;

    if (schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) {
      const key = `${schedule.id}:${resourceId}`;
      const durations = await this.operatingAttributionService.getDurationsForWindows(
        [{ key, resourceId, start: baseline }],
        now,
        manager,
      );
      durationMs = this.selectedDuration(schedule, durations.get(key));
    } else if (schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) {
      usageCount = await this.getUsageSessionCountSince(resourceId, baseline, manager);
    }

    return this.evaluateTriggerThreshold(schedule, baseline, now, durationMs, usageCount);
  }

  protected selectedDuration(schedule: ResourceMaintenanceSchedule, durations?: ResourceDurations): number {
    return schedule.durationBasis === ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION
      ? (durations?.operatingDurationMs ?? 0)
      : (durations?.sessionDurationMs ?? 0);
  }
}

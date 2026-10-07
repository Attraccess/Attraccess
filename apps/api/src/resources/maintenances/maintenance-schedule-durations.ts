import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType } from '@attraccess/database-entities';
import { ResourceDurations } from '../operating-intervals/resource-operating-attribution.service';
import { MaintenanceScheduleStateImplementation } from './maintenance-schedule-state';
export abstract class MaintenanceScheduleDurationsImplementation extends MaintenanceScheduleStateImplementation {
  protected async loadScheduleDurations(
    allSchedules: ResourceMaintenanceSchedule[],
    pairs: Array<{ resourceId: number; scheduleId: number; triggerType: ResourceMaintenanceScheduleTriggerType }>,
    activeResourceIds: Set<number>,
    getBaseline: (resourceId: number, scheduleId: number) => Date,
    baselineMap: Map<string, Date>,
    now: Date,
  ) {
    const durationWindows = pairs
      .filter(
        ({ resourceId, triggerType }) =>
          triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS && !activeResourceIds.has(resourceId),
      )
      .map(({ resourceId, scheduleId }) => ({
        key: `${scheduleId}:${resourceId}`,
        resourceId,
        start: getBaseline(resourceId, scheduleId),
      }));
    const durations = await this.operatingAttributionService.getDurationsForWindows(durationWindows, now);

    // Observe query window sizes so we can alert if they grow unexpectedly large.
    // No lookback clamp: rarely-used machines need their full history to reach the threshold.
    const msPerDay = 24 * 60 * 60 * 1000;
    for (const schedule of allSchedules) {
      const baseline = baselineMap.get(`${schedule.id}:${schedule.resourceId}`);
      if (baseline)
        this.metricsService.maintenanceUsageQueryWindowDays.observe((now.getTime() - baseline.getTime()) / msPerDay);
    }

    return durations;
  }

  protected async selectTriggeringSchedules(
    allSchedules: ResourceMaintenanceSchedule[],
    knownResourceIds: Set<number>,
    activeResourceIds: Set<number>,
    getBaseline: (resourceId: number, scheduleId: number) => Date,
    durations: Map<string, ResourceDurations>,
    usageCountBySchedule: Map<string, number>,
    now: Date,
  ) {
    // --- IN-MEMORY EVALUATION PHASE ---

    // Group schedules by resource (only known resources) to preserve "first trigger wins" per resource
    const schedulesByResource = new Map<number, ResourceMaintenanceSchedule[]>();
    for (const s of allSchedules.filter((s) => knownResourceIds.has(s.resourceId))) {
      const arr = schedulesByResource.get(s.resourceId) ?? [];
      arr.push(s);
      schedulesByResource.set(s.resourceId, arr);
    }

    const toCreate: Array<{ resourceId: number; schedule: ResourceMaintenanceSchedule }> = [];

    for (const [resourceId, schedules] of schedulesByResource) {
      for (const schedule of schedules) {
        if (activeResourceIds.has(resourceId)) continue;

        const baseline = getBaseline(resourceId, schedule.id);
        const key = `${schedule.id}:${resourceId}`;
        if (
          this.evaluateTriggerThreshold(
            schedule,
            baseline,
            now,
            this.selectedDuration(schedule, durations.get(key)),
            usageCountBySchedule.get(key) ?? 0,
          )
        ) {
          toCreate.push({ resourceId, schedule });
          break; // Only one maintenance at a time per resource
        }
      }
    }

    return toCreate;
  }
}

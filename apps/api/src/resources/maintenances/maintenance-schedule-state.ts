import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType } from '@attraccess/database-entities';
import {
  buildScheduleEvaluationQuery,
  buildScheduleStateQuery,
  formatDbDate,
  MAX_PAIRS_PER_QUERY,
  parseDbDate,
} from './maintenance-schedule-evaluator.service.feature-definitions';
import { MaintenanceScheduleResourcesImplementation } from './maintenance-schedule-resources';
export abstract class MaintenanceScheduleStateImplementation extends MaintenanceScheduleResourcesImplementation {
  protected async loadScheduleState(
    allSchedules: ResourceMaintenanceSchedule[],
    knownResourceIds: Set<number>,
    resourceCreatedAtMap: Map<number, Date>,
    now: Date,
  ) {
    // 3. Resolve service-cycle state for duration/calendar schedules and retain the
    // single-statement baseline/count query for completed-session count schedules.
    const usageCountBySchedule = new Map<string, number>();
    const baselineMap = new Map<string, Date>();
    const activeResourceIds = new Set<number>();
    const pairs = allSchedules
      .filter((schedule) => knownResourceIds.has(schedule.resourceId))
      .map((schedule) => ({
        resourceId: schedule.resourceId,
        scheduleId: schedule.id,
        createdAt: resourceCreatedAtMap.get(schedule.resourceId) ?? now,
        triggerType: schedule.triggerType,
      }));
    if (pairs.length === 0) return;

    const setState = (row: {
      resourceId: number;
      scheduleId: number;
      baseline?: string | Date;
      hasActiveMaintenance?: number | boolean;
    }): void => {
      const key = `${row.scheduleId}:${row.resourceId}`;
      baselineMap.set(
        key,
        row.baseline ? parseDbDate(row.baseline) : (resourceCreatedAtMap.get(row.resourceId) ?? now),
      );
      if (row.hasActiveMaintenance) activeResourceIds.add(row.resourceId);
    };

    const statePairs = pairs.filter(
      ({ triggerType }) => triggerType !== ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    );
    for (let offset = 0; offset < statePairs.length; offset += MAX_PAIRS_PER_QUERY) {
      const chunk = statePairs.slice(offset, offset + MAX_PAIRS_PER_QUERY);
      const stateRows: Array<{
        resourceId: number;
        scheduleId: number;
        baseline?: string | Date;
        hasActiveMaintenance?: number | boolean;
      }> = await this.usageRepository.query(
        buildScheduleStateQuery(this.maintenanceRepository.metadata.tableName, chunk.length),
        [
          ...chunk.flatMap((pair) => [pair.resourceId, pair.scheduleId, formatDbDate(pair.createdAt)]),
          formatDbDate(now),
        ],
      );
      for (const row of stateRows) setState(row);
    }

    const usagePairs = pairs.filter(
      ({ triggerType }) => triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    );
    for (let offset = 0; offset < usagePairs.length; offset += MAX_PAIRS_PER_QUERY) {
      const chunk = usagePairs.slice(offset, offset + MAX_PAIRS_PER_QUERY);
      const aggregates: Array<{
        resourceId: number;
        scheduleId: number;
        baseline?: string | Date;
        hasActiveMaintenance?: number | boolean;
        totalCount: number | string | null;
      }> = await this.usageRepository.query(
        buildScheduleEvaluationQuery(
          this.maintenanceRepository.metadata.tableName,
          this.usageRepository.metadata.tableName,
          chunk.length,
        ),
        [
          ...chunk.flatMap((pair) => [pair.resourceId, pair.scheduleId, formatDbDate(pair.createdAt)]),
          formatDbDate(now),
        ],
      );
      for (const row of aggregates) {
        setState(row);
        const key = `${row.scheduleId}:${row.resourceId}`;
        usageCountBySchedule.set(key, Number(row.totalCount ?? 0));
      }
    }

    const getBaseline = (resourceId: number, scheduleId: number): Date =>
      baselineMap.get(`${scheduleId}:${resourceId}`) ?? resourceCreatedAtMap.get(resourceId) ?? now;

    return { pairs, usageCountBySchedule, baselineMap, activeResourceIds, getBaseline };
  }
}

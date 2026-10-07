import { ResourceMaintenanceSchedule } from '@attraccess/database-entities';
import { In } from 'typeorm';
import { MaintenanceEventEvaluationImplementation } from './maintenance-event-evaluation';
export abstract class MaintenanceScheduleResourcesImplementation extends MaintenanceEventEvaluationImplementation {
  /**
   * Evaluate all resources that have at least one enabled schedule.
   *
   * Bulk pre-fetch strategy (O(1) queries instead of O(resources) sequential transactions):
   * 1. Load all enabled schedules + configs in one query.
   * 2. Load resource createdAt dates as fallback baselines.
   * 3. Load completed-maintenance baselines and active state, then usage totals only for usage schedules.
   * 4. Write triggered schedules in bounded transactions.
   */
  protected async loadScheduleResources(allSchedules: ResourceMaintenanceSchedule[]) {
    // ponytail: reduce+Set avoids intermediate array from map() before Set construction
    const resourceIds = [...allSchedules.reduce((s, a) => s.add(a.resourceId), new Set<number>())];

    // 2. Resource createdAt — fallback baseline when no prior maintenance for a schedule
    const resources = await this.resourceRepository.find({
      where: { id: In(resourceIds) },
      select: ['id', 'createdAt'],
    });
    const resourceCreatedAtMap = new Map<number, Date>(resources.map((r) => [r.id, r.createdAt]));

    // Warn and skip schedules for resources missing from DB (orphaned foreign keys)
    const knownResourceIds = new Set(resources.map((r) => r.id));
    const orphanedResourceIds = resourceIds.filter((id) => !knownResourceIds.has(id));
    if (orphanedResourceIds.length > 0) {
      this.logger.warn(
        `${orphanedResourceIds.length} resource(s) have enabled schedules but no matching resource record — skipping: [${orphanedResourceIds.join(', ')}]`,
      );
    }

    return { resourceCreatedAtMap, knownResourceIds };
  }
}

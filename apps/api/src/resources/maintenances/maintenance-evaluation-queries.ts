import { Resource, ResourceMaintenance, ResourceUsage } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { MaintenanceScheduleEvaluatorServiceRouteContext } from './maintenance-schedule-evaluator.service.route-context';
export abstract class MaintenanceEvaluationQueriesImplementation extends MaintenanceScheduleEvaluatorServiceRouteContext {
  /**
   * Get the baseline date for a schedule: when the last maintenance created by this schedule was done,
   * or the resource's creation date if no such maintenance exists.
   */
  async getBaselineDate(resourceId: number, scheduleId: number, manager?: EntityManager): Promise<Date> {
    const maintenanceRepository = manager?.getRepository(ResourceMaintenance) ?? this.maintenanceRepository;
    const resourceRepository = manager?.getRepository(Resource) ?? this.resourceRepository;
    const lastDone = await maintenanceRepository
      .createQueryBuilder('m')
      .where('m.resourceId = :resourceId', { resourceId })
      .andWhere('m.maintenanceScheduleId = :scheduleId', { scheduleId })
      .andWhere('m.endTime IS NOT NULL')
      .orderBy('m.endTime', 'DESC')
      .limit(1)
      .getOne();

    if (lastDone?.endTime) {
      return lastDone.endTime;
    }

    const resource = await resourceRepository.findOne({
      where: { id: resourceId },
      select: ['id', 'createdAt'],
    });
    return resource?.createdAt ?? new Date(0);
  }

  /**
   * Count usage sessions for the resource since baseline (completed sessions only).
   */
  protected async getUsageSessionCountSince(resourceId: number, since: Date, manager?: EntityManager): Promise<number> {
    return (manager?.getRepository(ResourceUsage) ?? this.usageRepository)
      .createQueryBuilder('usage')
      .where('usage.resourceId = :resourceId', { resourceId })
      .andWhere('usage.lifecyclePending = :lifecyclePending', { lifecyclePending: false })
      .andWhere('usage.endTime IS NOT NULL')
      .andWhere('usage.endTime >= :since', { since })
      .getCount();
  }
}

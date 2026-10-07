import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { MaintenanceTriggerThresholdImplementation } from './maintenance-trigger-threshold';
export abstract class MaintenanceResourceEvaluationImplementation extends MaintenanceTriggerThresholdImplementation {
  /**
   * Evaluate all enabled schedules for a resource. If any triggers and there is no active maintenance, create one (first trigger wins).
   */
  async evaluateResource(resourceId: number): Promise<void> {
    let createdMaintenanceId: number | undefined;
    await this.scheduleRepository.manager.transaction(async (transactionalEntityManager) => {
      const scheduleRepo = transactionalEntityManager.getRepository(ResourceMaintenanceSchedule);
      const schedules = await scheduleRepo.find({
        where: { resourceId, enabled: true },
        relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
      });

      for (const schedule of schedules) {
        // Re-check active maintenance (another schedule might have just created one)
        const hasActiveMaintenance = await this.maintenanceService.hasActiveMaintenance(
          resourceId,
          transactionalEntityManager,
        );
        if (hasActiveMaintenance) {
          continue;
        }

        const triggers = await this.shouldTrigger(schedule, resourceId, transactionalEntityManager);
        if (!triggers) {
          continue;
        }

        const reason = this.buildMaintenanceReasonFromScheduleDefinition(schedule);
        const maintenance = await this.maintenanceService.createMaintenanceFromSchedule(
          resourceId,
          schedule.id,
          reason,
          transactionalEntityManager,
          false,
        );
        createdMaintenanceId = maintenance.id;
        this.logger.log(
          `Schedule ${schedule.id} triggered for resource ${resourceId}: created maintenance. Reason: ${reason}`,
        );
        break; // Only one maintenance at a time
      }
    });
    if (createdMaintenanceId !== undefined) {
      this.maintenanceService.emitScheduledMaintenanceCreated(resourceId, createdMaintenanceId);
    }
  }

  /**
   * Builds the schedule's reason as JSON for i18n: { i18nKey, details }.
   * Stored in maintenance.reason; describes what triggered this maintenance (the schedule).
   * Frontend keys: name.auto.usageHours, name.auto.usageCount, name.auto.intervalDays,
   * name.auto.thresholdHours, name.auto.fallback
   */
  protected buildMaintenanceReasonFromScheduleDefinition(schedule: ResourceMaintenanceSchedule): string {
    const scheduleName = schedule.name ?? undefined;
    const withParams = (details: Record<string, number | string | undefined>) => ({
      i18nKey: '' as string,
      details: { ...details, ...(scheduleName && { scheduleName }) },
    });

    switch (schedule.triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
        const config = schedule.usageHoursConfig;
        const duration = config?.duration ?? 0;
        const unit = config?.unit ?? UsageDurationUnit.HOURS;
        const i18nKey =
          unit === UsageDurationUnit.MINUTES
            ? 'reason.auto.usageHoursMinutes'
            : unit === UsageDurationUnit.HOURS
              ? 'reason.auto.usageHoursHours'
              : 'reason.auto.usageHoursDays';
        return JSON.stringify({
          ...withParams({ duration }),
          i18nKey,
        });
      }
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT: {
        const c = schedule.usageCountConfig;
        const count = c?.thresholdSessions ?? 0;
        return JSON.stringify({ ...withParams({ count }), i18nKey: 'reason.auto.usageCount' });
      }
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
        const config = schedule.timeIntervalConfig;
        const duration = config?.duration ?? 0;
        const unit = config?.unit ?? UsageDurationUnit.HOURS;
        const i18nKey =
          unit === UsageDurationUnit.MINUTES
            ? 'reason.auto.timeIntervalMinutes'
            : unit === UsageDurationUnit.HOURS
              ? 'reason.auto.timeIntervalHours'
              : 'reason.auto.timeIntervalDays';
        return JSON.stringify({
          ...withParams({ duration }),
          i18nKey,
        });
      }
      default:
        return JSON.stringify({
          ...withParams({ scheduleId: schedule.id }),
          i18nKey: 'reason.auto.fallback',
        });
    }
  }
}

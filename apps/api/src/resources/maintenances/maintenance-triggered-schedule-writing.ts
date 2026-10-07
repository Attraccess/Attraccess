import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType } from '@attraccess/database-entities';
import { MaintenanceScheduleDurationsImplementation } from './maintenance-schedule-durations';
import { WRITE_TRANSACTION_BATCH_SIZE } from './maintenance-schedule-evaluator.service.feature-definitions';
export abstract class MaintenanceTriggeredScheduleWritingImplementation extends MaintenanceScheduleDurationsImplementation {
  protected async persistTriggeredSchedules(
    toCreate: Array<{ resourceId: number; schedule: ResourceMaintenanceSchedule }>,
  ) {
    // --- WRITE PHASE ---
    for (let offset = 0; offset < toCreate.length; offset += WRITE_TRANSACTION_BATCH_SIZE) {
      const batch = toCreate.slice(offset, offset + WRITE_TRANSACTION_BATCH_SIZE);
      const createdMaintenances: Array<{ resourceId: number; maintenanceId: number }> = [];
      try {
        await this.scheduleRepository.manager.transaction(async (em) => {
          for (const [index, { resourceId, schedule }] of batch.entries()) {
            const savepoint = `maintenance_schedule_${offset + index}`;
            await em.query(`SAVEPOINT ${savepoint}`);
            try {
              // Recheck by resource to prevent a concurrent manual or different-schedule maintenance.
              if (await this.maintenanceService.hasActiveMaintenance(resourceId, em)) {
                await em.query(`RELEASE SAVEPOINT ${savepoint}`);
                continue;
              }

              // A maintenance may have completed since the bulk read. Re-read the service cycle
              // and its duration within the write transaction before creating a new obligation.
              if (
                schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS &&
                !(await this.shouldTrigger(schedule, resourceId, em))
              ) {
                await em.query(`RELEASE SAVEPOINT ${savepoint}`);
                continue;
              }

              const reason = this.buildMaintenanceReasonFromScheduleDefinition(schedule);
              const maintenance = await this.maintenanceService.createMaintenanceFromSchedule(
                resourceId,
                schedule.id,
                reason,
                em,
                false,
              );
              await em.query(`RELEASE SAVEPOINT ${savepoint}`);
              createdMaintenances.push({ resourceId, maintenanceId: maintenance.id });
              this.logger.log(
                `Schedule ${schedule.id} triggered for resource ${resourceId}: created maintenance. Reason: ${reason}`,
              );
            } catch (err) {
              await em.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
              await em.query(`RELEASE SAVEPOINT ${savepoint}`);
              this.logger.error(
                `Error creating scheduled maintenance for resource ${resourceId}: ${err}`,
                (err as Error)?.stack,
              );
            }
          }
        });

        // The batch transaction commits before notifications are emitted.
        for (const { resourceId, maintenanceId } of createdMaintenances) {
          this.maintenanceService.emitScheduledMaintenanceCreated(resourceId, maintenanceId);
        }
      } catch (err) {
        this.logger.error(`Error creating scheduled maintenance batch: ${err}`, (err as Error)?.stack);
      }
    }
  }

  async evaluateAll(): Promise<void> {
    if (this.evaluationLock) {
      this.logger.debug('Schedule evaluation already in progress, skipping');
      return;
    }
    this.evaluationLock = true;
    try {
      const now = new Date();

      // --- BULK READ PHASE ---

      // 1. All enabled schedules with trigger configs
      const allSchedules = await this.scheduleRepository.find({
        where: { enabled: true },
        relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
      });

      if (allSchedules.length === 0) return;

      const { resourceCreatedAtMap, knownResourceIds } = await this.loadScheduleResources(allSchedules);
      const state = await this.loadScheduleState(allSchedules, knownResourceIds, resourceCreatedAtMap, now);
      if (!state) return;
      const { pairs, usageCountBySchedule, baselineMap, activeResourceIds, getBaseline } = state;
      const durations = await this.loadScheduleDurations(
        allSchedules,
        pairs,
        activeResourceIds,
        getBaseline,
        baselineMap,
        now,
      );
      const toCreate = await this.selectTriggeringSchedules(
        allSchedules,
        knownResourceIds,
        activeResourceIds,
        getBaseline,
        durations,
        usageCountBySchedule,
        now,
      );
      if (toCreate.length === 0) return;

      await this.persistTriggeredSchedules(toCreate);
    } finally {
      this.evaluationLock = false;
    }
  }
}

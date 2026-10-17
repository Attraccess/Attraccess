import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType } from '@attraccess/application-models';

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { MaintenanceEvaluationPersistence, MaintenanceBatchIsolationError } from './persistence/port';

import { DatabaseTransactions } from '../../database/transaction-scope';

import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';

import { MetricsService } from '../../metrics/metrics.service';

import {
  ResourceOperatingAttributionService,
  ResourceDurations,
} from '../operating-intervals/resource-operating-attribution.service';

import { ResourceMaintenanceService } from './maintenance.service';
import { MaintenanceResourceEvaluation } from './evaluation/resource-evaluation';
export const WRITE_TRANSACTION_BATCH_SIZE = 100;

@Injectable()
export class MaintenanceScheduleEvaluatorService extends MaintenanceResourceEvaluation implements OnModuleDestroy {
  constructor(
    @Inject(MaintenanceEvaluationPersistence) protected readonly persistence: MaintenanceEvaluationPersistence,
    protected readonly transactions: DatabaseTransactions,
    protected readonly maintenanceService: ResourceMaintenanceService,
    protected readonly cronTimer: CronTimer,
    protected readonly metricsService: MetricsService,
    protected readonly operatingAttributionService: ResourceOperatingAttributionService,
  ) {
    super();
  }

  protected readonly logger = new Logger(MaintenanceScheduleEvaluatorService.name);

  protected evaluationLock = false;

  /** Debounce window in ms: evaluation is delayed until no new events arrive within this window. */
  protected readonly usageEvalDebounceMs = 5_000;

  /** Maximum wait in ms: evaluation fires even if events keep arriving, preventing indefinite starvation. */
  protected readonly usageEvalMaxWaitMs = 30_000;

  protected readonly pendingUsageEvals = new Map<number, ReturnType<typeof setTimeout>>();

  /** Timestamp (Date.now()) of the first unprocessed usage event per resource, for maxWait tracking. */
  protected readonly usageEvalFirstEventAt = new Map<number, number>();

  protected async persistTriggeredSchedules(
    toCreate: Array<{ resourceId: number; schedule: ResourceMaintenanceSchedule }>,
  ) {
    // --- WRITE PHASE ---
    for (let offset = 0; offset < toCreate.length; offset += WRITE_TRANSACTION_BATCH_SIZE) {
      const batch = toCreate.slice(offset, offset + WRITE_TRANSACTION_BATCH_SIZE);
      const createdMaintenances: Array<{ resourceId: number; maintenanceId: number }> = [];
      try {
        await this.transactions.run(
          { resourceIds: batch.map((candidate) => candidate.resourceId), accountIds: [] },
          async (em) => {
            for (const { resourceId, schedule } of batch) {
              try {
                let reason: string | undefined;
                const maintenanceId = await this.evaluationOperations(em).attemptCreation(resourceId, async () => {
                  if (await this.maintenanceService.hasActiveMaintenance(resourceId, em)) return undefined;
                  if (
                    schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS &&
                    !(await this.shouldTrigger(schedule, resourceId, em))
                  )
                    return undefined;
                  reason = this.buildMaintenanceReasonFromScheduleDefinition(schedule);
                  return (
                    await this.maintenanceService.createMaintenanceFromSchedule(
                      resourceId,
                      schedule.id,
                      reason,
                      em,
                      false,
                    )
                  ).id;
                });
                if (maintenanceId !== undefined) {
                  createdMaintenances.push({ resourceId, maintenanceId });
                  this.logger.log(
                    `Schedule ${schedule.id} triggered for resource ${resourceId}: created maintenance. Reason: ${reason}`,
                  );
                }
              } catch (err) {
                if (err instanceof MaintenanceBatchIsolationError) throw err;
                this.logger.error(
                  `Error creating scheduled maintenance for resource ${resourceId}: ${err}`,
                  (err as Error)?.stack,
                );
              }
            }
          },
        );

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
      const allSchedules = await this.persistence.enabledSchedules();

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
      baseline: Date | null;
      hasActiveMaintenance?: number | boolean;
    }): void => {
      const key = `${row.scheduleId}:${row.resourceId}`;
      baselineMap.set(key, row.baseline ? row.baseline : (resourceCreatedAtMap.get(row.resourceId) ?? now));
      if (row.hasActiveMaintenance) activeResourceIds.add(row.resourceId);
    };

    const statePairs = pairs.filter(
      ({ triggerType }) => triggerType !== ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    );
    for (const row of await this.persistence.scheduleState(statePairs, now, false)) setState(row);

    const usagePairs = pairs.filter(
      ({ triggerType }) => triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    );
    for (const row of await this.persistence.scheduleState(usagePairs, now, true)) {
      setState(row);
      usageCountBySchedule.set(`${row.scheduleId}:${row.resourceId}`, row.totalCount ?? 0);
    }

    const getBaseline = (resourceId: number, scheduleId: number): Date =>
      baselineMap.get(`${scheduleId}:${resourceId}`) ?? resourceCreatedAtMap.get(resourceId) ?? now;

    return { pairs, usageCountBySchedule, baselineMap, activeResourceIds, getBaseline };
  }

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
    const resources = await this.persistence.resourceCreationDates(resourceIds);
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

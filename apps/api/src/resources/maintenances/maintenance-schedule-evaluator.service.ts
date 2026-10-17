import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceUsage,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/database-entities';

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, In } from 'typeorm';

import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';

import { MetricsService } from '../../metrics/metrics.service';

import {
  ResourceOperatingAttributionService,
  ResourceDurations,
} from '../operating-intervals/resource-operating-attribution.service';

import { ResourceMaintenanceService } from './maintenance.service';
import { MaintenanceResourceEvaluation } from './evaluation/resource-evaluation';
export /**
 * SQLite stores `datetime` columns as `YYYY-MM-DD HH:mm:ss.SSS` in UTC (TypeORM's
 * DateUtils.mixedDateToUtcDatetimeString). `new Date(...)` parses that as *local* time, and
 * `.toISOString()` produces a `T`/`Z` form that doesn't compare correctly against stored values.
 * These two helpers are the only places that bridge the formats.
 */
const parseDbDate = (value: string | Date): Date =>
  value instanceof Date ? value : new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);

export const formatDbDate = (date: Date): string => date.toISOString().replace('T', ' ').replace('Z', '');

/**
 * Per-(resource, schedule) evaluation data in one query. The `(resourceId, scheduleId, createdAt)`
 * triples are supplied as a CTE, so each schedule is evaluated against its own completed-maintenance
 * baseline without interpolating application values into SQL text.
 */
export const buildScheduleEvaluationQuery = (
  maintenanceTable: string,
  usageTable: string,
  pairCount: number,
): string => {
  const pairs = Array.from({ length: pairCount }, () => '(?, ?, ?)').join(', ');

  return `WITH pairs(resourceId, scheduleId, createdAt) AS (VALUES ${pairs}),
               baselines AS (
                 SELECT p.resourceId,
                        p.scheduleId,
                        COALESCE(MAX(done.endTime), p.createdAt) AS baseline,
                        EXISTS(
                          SELECT 1
                          FROM "${maintenanceTable}" active
                          WHERE active.resourceId = p.resourceId
                            AND active.startTime <= ?
                            AND active.endTime IS NULL
                        ) AS hasActiveMaintenance
                 FROM pairs p
                 LEFT JOIN "${maintenanceTable}" done
                   ON done.resourceId = p.resourceId
                  AND done.maintenanceScheduleId = p.scheduleId
                  AND done.endTime IS NOT NULL
                 GROUP BY p.resourceId, p.scheduleId, p.createdAt
               )
          SELECT b.resourceId AS resourceId,
                 b.scheduleId AS scheduleId,
                 b.baseline AS baseline,
                 b.hasActiveMaintenance AS hasActiveMaintenance,
                 COUNT(u.id) AS totalCount
          FROM baselines b
          LEFT JOIN "${usageTable}" u
            ON u.resourceId = b.resourceId
           AND u.lifecyclePending = 0
           AND u.endTime IS NOT NULL
           AND u.endTime >= b.baseline
          GROUP BY b.resourceId, b.scheduleId, b.baseline, b.hasActiveMaintenance`;
};

export const MAX_PAIRS_PER_QUERY = 10_921;

export const WRITE_TRANSACTION_BATCH_SIZE = 100;

/** Fetch completed-maintenance baselines and active state without scanning resource usage. */
export const buildScheduleStateQuery = (maintenanceTable: string, pairCount: number): string => {
  const pairs = Array.from({ length: pairCount }, () => '(?, ?, ?)').join(', ');

  return `WITH pairs(resourceId, scheduleId, createdAt) AS (VALUES ${pairs})
          SELECT p.resourceId AS resourceId,
                 p.scheduleId AS scheduleId,
                 COALESCE(MAX(done.endTime), p.createdAt) AS baseline,
                 EXISTS(
                   SELECT 1
                   FROM "${maintenanceTable}" active
                   WHERE active.resourceId = p.resourceId
                     AND active.startTime <= ?
                     AND active.endTime IS NULL
                 ) AS hasActiveMaintenance
          FROM pairs p
          LEFT JOIN "${maintenanceTable}" done
            ON done.resourceId = p.resourceId
           AND done.maintenanceScheduleId = p.scheduleId
           AND done.endTime IS NOT NULL
          GROUP BY p.resourceId, p.scheduleId, p.createdAt`;
};

@Injectable()
export class MaintenanceScheduleEvaluatorService extends MaintenanceResourceEvaluation implements OnModuleDestroy {
  constructor(
    @InjectRepository(ResourceMaintenanceSchedule)
    protected readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>,
    @InjectRepository(ResourceMaintenance)
    protected readonly maintenanceRepository: Repository<ResourceMaintenance>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceUsage)
    protected readonly usageRepository: Repository<ResourceUsage>,
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

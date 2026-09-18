import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleDurationBasis,
  ResourceMaintenanceScheduleTriggerType,
  Resource,
  ResourceUsage,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { MetricsService } from '../../metrics/metrics.service';

/**
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
                  COALESCE(SUM(u.usageInMinutes), 0) AS totalMinutes,
                  COALESCE(SUM(u.attributedOperatingDurationInMinutes), 0) AS totalOperatingMinutes,
                 COUNT(u.id) AS totalCount
          FROM baselines b
          LEFT JOIN "${usageTable}" u
            ON u.resourceId = b.resourceId
           AND u.endTime IS NOT NULL
           AND u.endTime >= b.baseline
          GROUP BY b.resourceId, b.scheduleId, b.baseline, b.hasActiveMaintenance`;
};

const MAX_PAIRS_PER_QUERY = 10_921;
const WRITE_TRANSACTION_BATCH_SIZE = 100;

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

/**
 * Evaluates maintenance schedules and creates ResourceMaintenance when a schedule's condition is met.
 * Baseline for all trigger types: when the last maintenance created by this schedule was marked done
 * (that maintenance's endTime/completedAt). If none, uses resource.createdAt.
 *
 * Runs via cron (periodic) and on usage events (session ended) so USAGE_HOURS and USAGE_COUNT triggers take effect immediately.
 */
@Injectable()
export class MaintenanceScheduleEvaluatorService implements OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceScheduleEvaluatorService.name);
  private evaluationLock = false;

  /** Debounce window in ms: evaluation is delayed until no new events arrive within this window. */
  private readonly usageEvalDebounceMs = 5_000;
  /** Maximum wait in ms: evaluation fires even if events keep arriving, preventing indefinite starvation. */
  private readonly usageEvalMaxWaitMs = 30_000;
  private readonly pendingUsageEvals = new Map<number, ReturnType<typeof setTimeout>>();
  /** Timestamp (Date.now()) of the first unprocessed usage event per resource, for maxWait tracking. */
  private readonly usageEvalFirstEventAt = new Map<number, number>();

  constructor(
    @InjectRepository(ResourceMaintenanceSchedule)
    private readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>,
    @InjectRepository(ResourceMaintenance)
    private readonly maintenanceRepository: Repository<ResourceMaintenance>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceUsage)
    private readonly usageRepository: Repository<ResourceUsage>,
    private readonly maintenanceService: ResourceMaintenanceService,
    private readonly cronTimer: CronTimer,
    private readonly metricsService: MetricsService,
  ) {}

  /** Drop pending debounce timers so shutdown isn't held up (and they don't fire against a closed DB). */
  onModuleDestroy(): void {
    for (const timer of this.pendingUsageEvals.values()) clearTimeout(timer);
    this.pendingUsageEvals.clear();
    this.usageEvalFirstEventAt.clear();
  }

  /**
   * Get the baseline date for a schedule: when the last maintenance created by this schedule was done,
   * or the resource's creation date if no such maintenance exists.
   */
  async getBaselineDate(resourceId: number, scheduleId: number): Promise<Date> {
    const lastDone = await this.maintenanceRepository
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

    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
      select: ['id', 'createdAt'],
    });
    return resource?.createdAt ?? new Date(0);
  }

  /**
   * Sum usage minutes for the resource since baseline (completed sessions only).
   */
  private async getUsageMinutesSince(
    resourceId: number,
    since: Date,
    durationBasis: ResourceMaintenanceScheduleDurationBasis,
  ): Promise<number> {
    const durationColumn =
      durationBasis === ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION
        ? 'usage.attributedOperatingDurationInMinutes'
        : 'usage.usageInMinutes';
    const result = await this.usageRepository
      .createQueryBuilder('usage')
      .select(`COALESCE(SUM(${durationColumn}), 0)`, 'total')
      .where('usage.resourceId = :resourceId', { resourceId })
      .andWhere('usage.endTime IS NOT NULL')
      .andWhere('usage.endTime >= :since', { since })
      .getRawOne<{ total: string }>();

    return Number(result?.total ?? '0');
  }

  /**
   * Count usage sessions for the resource since baseline (completed sessions only).
   */
  private async getUsageSessionCountSince(resourceId: number, since: Date): Promise<number> {
    return this.usageRepository
      .createQueryBuilder('usage')
      .where('usage.resourceId = :resourceId', { resourceId })
      .andWhere('usage.endTime IS NOT NULL')
      .andWhere('usage.endTime >= :since', { since })
      .getCount();
  }

  /**
   * Convert duration + unit to total minutes (for usage threshold comparison).
   */
  private durationToMinutes(duration: number, unit: UsageDurationUnit): number {
    switch (unit) {
      case UsageDurationUnit.MINUTES:
        return duration;
      case UsageDurationUnit.HOURS:
        return duration * 60;
      case UsageDurationUnit.DAYS:
        return duration * 24 * 60;
      default:
        return duration;
    }
  }

  /**
   * Pure comparison: given pre-fetched usage numbers and elapsed time, returns true if the schedule
   * threshold is met. Both shouldTrigger() and shouldTriggerInMemory() delegate here so the
   * switch-on-triggerType logic lives in exactly one place.
   */
  private evaluateTriggerThreshold(
    schedule: ResourceMaintenanceSchedule,
    baseline: Date,
    now: Date,
    usageMinutes: number,
    usageCount: number,
  ): boolean {
    switch (schedule.triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
        const config = schedule.usageHoursConfig;
        if (!config) return false;
        return usageMinutes >= this.durationToMinutes(config.duration, config.unit);
      }
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT: {
        const config = schedule.usageCountConfig;
        if (!config) return false;
        return usageCount >= config.thresholdSessions;
      }
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
        const config = schedule.timeIntervalConfig;
        if (!config) return false;
        const elapsedMinutes = (now.getTime() - baseline.getTime()) / (60 * 1000);
        return elapsedMinutes >= this.durationToMinutes(config.duration, config.unit);
      }
      default:
        return false;
    }
  }

  /**
   * Returns true if the schedule's condition is met.
   */
  async shouldTrigger(schedule: ResourceMaintenanceSchedule, resourceId: number): Promise<boolean> {
    const baseline = await this.getBaselineDate(resourceId, schedule.id);
    const now = new Date();
    let usageMinutes = 0;
    let usageCount = 0;

    if (schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) {
      usageMinutes = await this.getUsageMinutesSince(resourceId, baseline, schedule.durationBasis);
    } else if (schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) {
      usageCount = await this.getUsageSessionCountSince(resourceId, baseline);
    }

    return this.evaluateTriggerThreshold(schedule, baseline, now, usageMinutes, usageCount);
  }

  /**
   * Evaluate trigger condition for a schedule using pre-fetched in-memory aggregates.
   * Used by evaluateAll() to avoid per-resource queries.
   */
  private shouldTriggerInMemory(
    schedule: ResourceMaintenanceSchedule,
    resourceId: number,
    baseline: Date,
    now: Date,
    usageAggBySchedule: Map<string, { totalMinutes: number; totalOperatingMinutes: number; totalCount: number }>,
  ): boolean {
    const { totalMinutes, totalOperatingMinutes, totalCount } = usageAggBySchedule.get(`${schedule.id}:${resourceId}`) ?? {
      totalMinutes: 0,
      totalOperatingMinutes: 0,
      totalCount: 0,
    };
    const usageMinutes =
      schedule.durationBasis === ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION
        ? totalOperatingMinutes
        : totalMinutes;
    return this.evaluateTriggerThreshold(schedule, baseline, now, usageMinutes, totalCount);
  }

  /**
   * Evaluate all enabled schedules for a resource. If any triggers and there is no active maintenance, create one (first trigger wins).
   */
  async evaluateResource(resourceId: number): Promise<void> {
    await this.scheduleRepository.manager.transaction(async (transactionalEntityManager) => {
      const scheduleRepo = transactionalEntityManager.getRepository(ResourceMaintenanceSchedule);
      const schedules = await scheduleRepo.find({
        where: { resourceId, enabled: true },
        relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
      });

      for (const schedule of schedules) {
        // Re-check active maintenance (another schedule might have just created one)
        const hasActiveMaintenanceOfThisSchedule = await this.maintenanceService.hasActiveMaintenance(
          { resourceId, scheduleId: schedule.id },
          transactionalEntityManager,
        );
        if (hasActiveMaintenanceOfThisSchedule) {
          continue;
        }

        const triggers = await this.shouldTrigger(schedule, resourceId);
        if (!triggers) {
          continue;
        }

        const reason = this.buildMaintenanceReasonFromScheduleDefinition(schedule);
        await this.maintenanceService.createMaintenanceFromSchedule(
          resourceId,
          schedule.id,
          reason,
          transactionalEntityManager,
        );
        this.logger.log(
          `Schedule ${schedule.id} triggered for resource ${resourceId}: created maintenance. Reason: ${reason}`,
        );
        break; // Only one maintenance at a time
      }
    });
  }

  /**
   * Builds the schedule's reason as JSON for i18n: { i18nKey, details }.
   * Stored in maintenance.reason; describes what triggered this maintenance (the schedule).
   * Frontend keys: name.auto.usageHours, name.auto.usageCount, name.auto.intervalDays,
   * name.auto.thresholdHours, name.auto.fallback
   */
  private buildMaintenanceReasonFromScheduleDefinition(schedule: ResourceMaintenanceSchedule): string {
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

  /**
   * Cron: run schedule evaluation every 5 minutes. Only one active maintenance per resource; idempotent when already in maintenance.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runScheduledEvaluation(): Promise<void> {
    await this.cronTimer.time('maintenance_evaluator', async () => {
      await this.evaluateAll();
    });
  }

  /**
   * On usage events (session ended): evaluate schedules for that resource so USAGE_HOURS and USAGE_COUNT
   * triggers take effect immediately instead of waiting for the next cron run.
   *
   * Debounced per resource with a maximum wait: rapid session end/start bursts collapse into a single
   * evaluation, but evaluation is guaranteed to fire within usageEvalMaxWaitMs regardless of how
   * frequently events arrive (preventing indefinite starvation under sustained load).
   *
   * Listens to ResourceSessionStartedEvent rather than ResourceUsageSessionEndedEvent: despite the
   * name, ResourceUsageService.emitUsageEvent() fires it on every session start *and* end (with the
   * usage re-read after commit, so endTime is set). ResourceUsageSessionEndedEvent only fires on
   * takeover/flow-ended sessions, which would miss the common case of a user ending their own session.
   */
  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  onResourceUsage(event: ResourceSessionStartedEvent): void {
    const resourceId = event.usage?.resource?.id;
    if (resourceId == null) return;
    // Only re-evaluate when a session was ended (endTime set); that's when usage minutes and session count increase.
    if (event.usage.endTime == null) return;

    const now = Date.now();

    // Record the timestamp of the first event in the current debounce window
    if (!this.usageEvalFirstEventAt.has(resourceId)) {
      this.usageEvalFirstEventAt.set(resourceId, now);
    }

    const firstEventAt = this.usageEvalFirstEventAt.get(resourceId) ?? now;
    const msUntilMaxWait = this.usageEvalMaxWaitMs - (now - firstEventAt);
    // Fire after the debounce window, but no later than the maxWait deadline
    const delay = Math.min(this.usageEvalDebounceMs, Math.max(0, msUntilMaxWait));

    const existing = this.pendingUsageEvals.get(resourceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.pendingUsageEvals.delete(resourceId);
      this.usageEvalFirstEventAt.delete(resourceId);
      this.evaluateResource(resourceId).catch((err) => {
        this.logger.error(
          `Error evaluating schedules for resource ${resourceId} after usage event: ${err}`,
          (err as Error)?.stack,
        );
      });
    }, delay);

    this.pendingUsageEvals.set(resourceId, timer);
  }

  /**
   * On maintenance changed (created or marked done): re-evaluate schedules for that resource.
   * When maintenance is marked done, this allows the next schedule to trigger immediately
   * instead of waiting for the next cron run (up to 5 minutes).
   *
   * Deferred via setImmediate to avoid nested transaction / SQLite savepoint errors when the
   * event is emitted from within evaluateResource's transaction (e.g. createMaintenanceFromSchedule).
   */
  @OnEvent(ResourceMaintenanceChangedEvent.EVENT_NAME)
  onMaintenanceChanged(event: ResourceMaintenanceChangedEvent): void {
    const resourceId = event.resourceId;
    if (resourceId == null) return;

    setImmediate(() => {
      this.evaluateResource(resourceId).catch((err) => {
        this.logger.error(
          `Error evaluating schedules for resource ${resourceId} after maintenance changed: ${err}`,
          (err as Error)?.stack,
        );
      });
    });
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

      // 3. Time schedules only need baseline and active state. Usage schedules resolve their
      // baseline and aggregate usage in one statement below so both values share a DB snapshot.
      const usageAggBySchedule = new Map<string, {
        totalMinutes: number;
        totalOperatingMinutes: number;
        totalCount: number;
      }>();
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

      const timePairs = pairs.filter(
        ({ triggerType }) => triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
      );
      for (let offset = 0; offset < timePairs.length; offset += MAX_PAIRS_PER_QUERY) {
        const chunk = timePairs.slice(offset, offset + MAX_PAIRS_PER_QUERY);
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

      const usagePairs = pairs.filter(({ triggerType }) => {
        return (
          triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS ||
          triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT
        );
      });
      for (let offset = 0; offset < usagePairs.length; offset += MAX_PAIRS_PER_QUERY) {
        const chunk = usagePairs.slice(offset, offset + MAX_PAIRS_PER_QUERY);
        const aggregates: Array<{
          resourceId: number;
          scheduleId: number;
          baseline?: string | Date;
          hasActiveMaintenance?: number | boolean;
           totalMinutes: number | string | null;
           totalOperatingMinutes: number | string | null;
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
          usageAggBySchedule.set(key, {
              totalMinutes: Number(row.totalMinutes ?? 0),
              totalOperatingMinutes: Number(row.totalOperatingMinutes ?? 0),
              totalCount: Number(row.totalCount ?? 0),
          });
        }
      }

      const getBaseline = (resourceId: number, scheduleId: number): Date =>
        baselineMap.get(`${scheduleId}:${resourceId}`) ?? resourceCreatedAtMap.get(resourceId) ?? now;

      // Observe query window sizes so we can alert if they grow unexpectedly large.
      // No lookback clamp: rarely-used machines need their full history to reach the threshold.
      const msPerDay = 24 * 60 * 60 * 1000;
      for (const schedule of allSchedules) {
        const baseline = baselineMap.get(`${schedule.id}:${schedule.resourceId}`);
        if (baseline)
          this.metricsService.maintenanceUsageQueryWindowDays.observe((now.getTime() - baseline.getTime()) / msPerDay);
      }

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
          if (this.shouldTriggerInMemory(schedule, resourceId, baseline, now, usageAggBySchedule)) {
            toCreate.push({ resourceId, schedule });
            break; // Only one maintenance at a time per resource
          }
        }
      }

      if (toCreate.length === 0) return;

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
    } finally {
      this.evaluationLock = false;
    }
  }
}

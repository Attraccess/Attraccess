import { MaintenanceScheduleRecord, ResourceMaintenanceScheduleTriggerType } from '@attraccess/application-models';

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { OnEvent } from '@nestjs/event-emitter';

import { Cron, CronExpression } from '@nestjs/schedule';

import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';

import { MetricsService } from '../../metrics/metrics.service';

import {
  ResourceOperatingAttributionService,
  ResourceDurations,
} from '../operating-intervals/resource-operating-attribution.service';

import { ResourceOperatingStateChangedEvent } from '../operating-intervals/events/resource-operating-state-changed.event';

import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageLifecycleAbortedEvent,
} from '../usage/events/resource-usage.events';

import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';

import { ResourceMaintenanceService } from './maintenance.service';

import { MaintenanceResourceEvaluation } from './evaluation/resource-evaluation';

import {
  MAINTENANCE_EVALUATION_STORE,
  type MaintenanceEvaluationStore,
  type MaintenanceEvaluationView,
  type ServiceCycleRequest,
} from './maintenance-evaluation-store.port';

/** Writes of one transaction when schedules are persisted in bulk (engines without snapshot reads). */
export const WRITE_TRANSACTION_BATCH_SIZE = 100;

/**
 * Creates the maintenances that schedules ask for: every five minutes for all resources, and debounced after
 * usage, operating and maintenance events for one resource ({@link MaintenanceResourceEvaluation}).
 */
@Injectable()
export class MaintenanceScheduleEvaluatorService implements OnModuleDestroy {
  private readonly evaluation: MaintenanceResourceEvaluation;

  constructor(
    @Inject(MAINTENANCE_EVALUATION_STORE)
    private readonly store: MaintenanceEvaluationStore,
    private readonly maintenanceService: ResourceMaintenanceService,
    private readonly cronTimer: CronTimer,
    private readonly metricsService: MetricsService,
    private readonly operatingAttributionService: ResourceOperatingAttributionService,
  ) {
    this.evaluation = new MaintenanceResourceEvaluation(
      store,
      maintenanceService,
      operatingAttributionService,
      this.logger,
      (resourceId) => this.queueEvaluation(resourceId),
    );
  }

  private readonly logger = new Logger(MaintenanceScheduleEvaluatorService.name);

  private evaluationLock = false;

  /** Debounce window in ms: evaluation is delayed until no new events arrive within this window. */
  private readonly usageEvalDebounceMs = 5_000;

  /** Maximum wait in ms: evaluation fires even if events keep arriving, preventing indefinite starvation. */
  private readonly usageEvalMaxWaitMs = 30_000;

  private readonly pendingUsageEvals = new Map<number, ReturnType<typeof setTimeout>>();

  /** Timestamp (Date.now()) of the first unprocessed usage event per resource, for maxWait tracking. */
  private readonly usageEvalFirstEventAt = new Map<number, number>();

  private async persistTriggeredSchedules(
    toCreate: Array<{ resourceId: number; schedule: MaintenanceScheduleRecord }>,
  ) {
    if (this.store.snapshotReads) {
      // Revalidate bulk candidates through the independent snapshot reader. Each
      // resource gets a short write transaction, letting usage proceed between them.
      for (const { resourceId } of toCreate) {
        try {
          await this.evaluateResource(resourceId);
        } catch (error) {
          this.logger.error(
            `Error creating scheduled maintenance for resource ${resourceId}: ${error}`,
            (error as Error)?.stack,
          );
        }
      }
      return;
    }
    // --- WRITE PHASE ---
    for (let offset = 0; offset < toCreate.length; offset += WRITE_TRANSACTION_BATCH_SIZE) {
      const batch = toCreate.slice(offset, offset + WRITE_TRANSACTION_BATCH_SIZE);
      const createdMaintenances: Array<{ resourceId: number; maintenanceId: number }> = [];
      try {
        await this.store.inTransaction(async (view) => {
          for (const { resourceId, schedule } of batch) {
            try {
              const maintenanceId = await view.atomically('maintenance_schedule', () =>
                this.createTriggeredMaintenance(view, resourceId, schedule),
              );
              if (maintenanceId !== undefined) createdMaintenances.push({ resourceId, maintenanceId });
            } catch (err) {
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

  /** The id of the maintenance a due schedule created, or undefined when a recheck found it no longer due. */
  private async createTriggeredMaintenance(
    view: MaintenanceEvaluationView,
    resourceId: number,
    schedule: MaintenanceScheduleRecord,
  ): Promise<number | undefined> {
    // Recheck by resource to prevent a concurrent manual or different-schedule maintenance.
    if (await this.maintenanceService.hasActiveMaintenance(resourceId, view.context)) return undefined;

    // A maintenance may have completed since the bulk read. Re-read the service cycle
    // and its duration within the write transaction before creating a new obligation.
    if (
      schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS &&
      !(await this.shouldTrigger(schedule, resourceId, view))
    ) {
      return undefined;
    }

    const reason = this.evaluation.buildMaintenanceReasonFromScheduleDefinition(schedule);
    const maintenance = await this.maintenanceService.createMaintenanceFromSchedule(
      resourceId,
      schedule.id,
      reason,
      view.context,
      false,
    );
    this.logger.log(
      `Schedule ${schedule.id} triggered for resource ${resourceId}: created maintenance. Reason: ${reason}`,
    );
    return maintenance.id;
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
      const allSchedules = await this.store.listEnabledSchedules();

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

  private async loadScheduleDurations(
    allSchedules: MaintenanceScheduleRecord[],
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

  private async selectTriggeringSchedules(
    allSchedules: MaintenanceScheduleRecord[],
    knownResourceIds: Set<number>,
    activeResourceIds: Set<number>,
    getBaseline: (resourceId: number, scheduleId: number) => Date,
    durations: Map<string, ResourceDurations>,
    usageCountBySchedule: Map<string, number>,
    now: Date,
  ) {
    // --- IN-MEMORY EVALUATION PHASE ---

    // Group schedules by resource (only known resources) to preserve "first trigger wins" per resource
    const schedulesByResource = new Map<number, MaintenanceScheduleRecord[]>();
    for (const s of allSchedules.filter((s) => knownResourceIds.has(s.resourceId))) {
      const arr = schedulesByResource.get(s.resourceId) ?? [];
      arr.push(s);
      schedulesByResource.set(s.resourceId, arr);
    }

    const toCreate: Array<{ resourceId: number; schedule: MaintenanceScheduleRecord }> = [];

    for (const [resourceId, schedules] of schedulesByResource) {
      for (const schedule of schedules) {
        if (activeResourceIds.has(resourceId)) continue;

        const baseline = getBaseline(resourceId, schedule.id);
        const key = `${schedule.id}:${resourceId}`;
        if (
          this.evaluation.evaluateTriggerThreshold(
            schedule,
            baseline,
            now,
            this.evaluation.selectedDuration(schedule, durations.get(key)),
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

  private async loadScheduleState(
    allSchedules: MaintenanceScheduleRecord[],
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

    const requests: ServiceCycleRequest[] = pairs.map(({ resourceId, scheduleId, createdAt, triggerType }) => ({
      resourceId,
      scheduleId,
      createdAt,
      countSessions: triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
    }));
    const countedKeys = new Set(requests.filter((r) => r.countSessions).map((r) => `${r.scheduleId}:${r.resourceId}`));
    for (const state of await this.store.loadServiceCycleStates(requests, now)) {
      const key = `${state.scheduleId}:${state.resourceId}`;
      baselineMap.set(key, state.baseline);
      if (state.hasActiveMaintenance) activeResourceIds.add(state.resourceId);
      if (countedKeys.has(key)) usageCountBySchedule.set(key, state.completedSessions);
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
  private async loadScheduleResources(allSchedules: MaintenanceScheduleRecord[]) {
    // ponytail: reduce+Set avoids intermediate array from map() before Set construction
    const resourceIds = [...allSchedules.reduce((s, a) => s.add(a.resourceId), new Set<number>())];

    // 2. Resource createdAt — fallback baseline when no prior maintenance for a schedule
    const resourceCreatedAtMap = await this.store.findResourceCreatedAt(resourceIds);

    // Warn and skip schedules for resources missing from DB (orphaned foreign keys)
    const knownResourceIds = new Set(resourceCreatedAtMap.keys());
    const orphanedResourceIds = resourceIds.filter((id) => !knownResourceIds.has(id));
    if (orphanedResourceIds.length > 0) {
      this.logger.warn(
        `${orphanedResourceIds.length} resource(s) have enabled schedules but no matching resource record — skipping: [${orphanedResourceIds.join(', ')}]`,
      );
    }

    return { resourceCreatedAtMap, knownResourceIds };
  }

  /** Drop pending debounce timers so shutdown isn't held up (and they don't fire against a closed DB). */
  async onModuleDestroy(): Promise<void> {
    this.evaluation.beginStop();
    for (const timer of this.pendingUsageEvals.values()) clearTimeout(timer);
    this.pendingUsageEvals.clear();
    this.usageEvalFirstEventAt.clear();
    await this.evaluation.drain();
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
   * On usage events (session started or ended): evaluate schedules for that resource so USAGE_HOURS and USAGE_COUNT
   * triggers take effect immediately instead of waiting for the next cron run.
   *
   * Debounced per resource with a maximum wait: rapid session end/start bursts collapse into a single
   * evaluation, but evaluation is guaranteed to fire within usageEvalMaxWaitMs regardless of how
   * frequently events arrive (preventing indefinite starvation under sustained load).
   *
   * Starts (and door actions) arrive as ResourceSessionStartedEvent, every session end as
   * ResourceUsageSessionEndedEvent; a take-over is followed by the new session's start event.
   */
  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  onResourceUsage(event: ResourceSessionStartedEvent): void {
    const resourceId = event.usage?.resource?.id;
    if (resourceId == null) return;
    this.queueEvaluation(resourceId);
  }

  @OnEvent(ResourceUsageSessionEndedEvent.EVENT_NAME)
  onResourceUsageEnded(event: ResourceUsageSessionEndedEvent): void {
    const resourceId = event.usage?.resourceId ?? event.usage?.resource?.id;
    if (resourceId == null) return;
    this.queueEvaluation(resourceId);
  }

  @OnEvent(ResourceOperatingStateChangedEvent.EVENT_NAME)
  onOperatingStateChanged(event: ResourceOperatingStateChangedEvent): void {
    this.queueEvaluation(event.resourceId);
  }

  @OnEvent(ResourceUsageLifecycleAbortedEvent.EVENT_NAME)
  onUsageLifecycleAborted(event: ResourceUsageLifecycleAbortedEvent): void {
    this.queueEvaluation(event.resourceId);
  }

  private queueEvaluation(resourceId: number): void {
    if (this.evaluation.stopping) return;
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
          `Error evaluating schedules for resource ${resourceId} after duration event: ${err}`,
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
   * Evaluate all enabled schedules for a resource. If any triggers and there is no active maintenance, create one (first trigger wins).
   */
  async evaluateResource(resourceId: number): Promise<void> {
    return this.evaluation.evaluateResource(resourceId);
  }

  async shouldTrigger(
    schedule: MaintenanceScheduleRecord,
    resourceId: number,
    view?: MaintenanceEvaluationView,
  ): Promise<boolean> {
    return this.evaluation.shouldTrigger(schedule, resourceId, view);
  }

  async getBaselineDate(resourceId: number, scheduleId: number, view?: MaintenanceEvaluationView): Promise<Date> {
    return this.evaluation.getBaselineDate(resourceId, scheduleId, view);
  }
}

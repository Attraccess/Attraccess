import { OnEvent } from '@nestjs/event-emitter';

import { Cron, CronExpression } from '@nestjs/schedule';

import { ResourceOperatingStateChangedEvent } from '../../operating-intervals/events/resource-operating-state-changed.event';

import {
  ResourceSessionStartedEvent,
  ResourceUsageLifecycleAbortedEvent,
} from '../../usage/events/resource-usage.events';

import { ResourceMaintenanceChangedEvent } from '../events/resource-maintenance-changed.event';

import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  UsageDurationUnit,
  ResourceMaintenanceScheduleDurationBasis,
  Resource,
  ResourceMaintenance,
  ResourceUsage,
} from '@attraccess/database-entities';

import { EntityManager, Repository } from 'typeorm';

import {
  ResourceDurations,
  ResourceOperatingAttributionService,
} from '../../operating-intervals/resource-operating-attribution.service';

import { Logger } from '@nestjs/common';

import { CronTimer } from '../../../metrics/instrumentation/cron/cron.helper';

import { MetricsService } from '../../../metrics/metrics.service';

import { ResourceMaintenanceService } from '../maintenance.service';

export abstract class MaintenanceResourceEvaluation {
  /** Drop pending debounce timers so shutdown isn't held up (and they don't fire against a closed DB). */
  onModuleDestroy(): void {
    for (const timer of this.pendingUsageEvals.values()) clearTimeout(timer);
    this.pendingUsageEvals.clear();
    this.usageEvalFirstEventAt.clear();
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
   * Listens to ResourceSessionStartedEvent rather than ResourceUsageSessionEndedEvent: despite the
   * name, ResourceUsageService.emitUsageEvent() fires it on every session start *and* end (with the
   * usage re-read after commit, so endTime is set). ResourceUsageSessionEndedEvent only fires on
   * takeover/flow-ended sessions, which would miss the common case of a user ending their own session.
   */
  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  onResourceUsage(event: ResourceSessionStartedEvent): void {
    const resourceId = event.usage?.resource?.id;
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

  protected queueEvaluation(resourceId: number): void {
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

  /**
   * Convert duration + unit to exact milliseconds (for usage threshold comparison).
   */
  protected durationToMs(duration: number, unit: UsageDurationUnit): number {
    switch (unit) {
      case UsageDurationUnit.MINUTES:
        return duration * 60_000;
      case UsageDurationUnit.HOURS:
        return duration * 60 * 60_000;
      case UsageDurationUnit.DAYS:
        return duration * 24 * 60 * 60_000;
      default:
        return duration * 60_000;
    }
  }

  /**
   * Pure comparison: given pre-fetched usage numbers and elapsed time, returns true if the schedule
   * threshold is met. Both individual and bulk evaluation delegate here so the
   * switch-on-triggerType logic lives in exactly one place.
   */
  protected evaluateTriggerThreshold(
    schedule: ResourceMaintenanceSchedule,
    baseline: Date,
    now: Date,
    durationMs: number,
    usageCount: number,
  ): boolean {
    switch (schedule.triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
        const config = schedule.usageHoursConfig;
        if (!config) return false;
        return durationMs >= this.durationToMs(config.duration, config.unit);
      }
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT: {
        const config = schedule.usageCountConfig;
        if (!config) return false;
        return usageCount >= config.thresholdSessions;
      }
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
        const config = schedule.timeIntervalConfig;
        if (!config) return false;
        const elapsedMs = now.getTime() - baseline.getTime();
        return elapsedMs >= this.durationToMs(config.duration, config.unit);
      }
      default:
        return false;
    }
  }

  /**
   * Returns true if the schedule's condition is met.
   */
  async shouldTrigger(
    schedule: ResourceMaintenanceSchedule,
    resourceId: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const baseline = await this.getBaselineDate(resourceId, schedule.id, manager);
    const now = new Date();
    let durationMs = 0;
    let usageCount = 0;

    if (schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS) {
      const key = `${schedule.id}:${resourceId}`;
      const durations = await this.operatingAttributionService.getDurationsForWindows(
        [{ key, resourceId, start: baseline }],
        now,
        manager,
      );
      durationMs = this.selectedDuration(schedule, durations.get(key));
    } else if (schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_COUNT) {
      usageCount = await this.getUsageSessionCountSince(resourceId, baseline, manager);
    }

    return this.evaluateTriggerThreshold(schedule, baseline, now, durationMs, usageCount);
  }

  protected selectedDuration(schedule: ResourceMaintenanceSchedule, durations?: ResourceDurations): number {
    return schedule.durationBasis === ResourceMaintenanceScheduleDurationBasis.ATTRIBUTABLE_OPERATING_DURATION
      ? (durations?.operatingDurationMs ?? 0)
      : (durations?.sessionDurationMs ?? 0);
  }

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

  protected abstract readonly pendingUsageEvals: Map<number, NodeJS.Timeout>;

  protected abstract readonly usageEvalFirstEventAt: Map<number, number>;

  protected abstract readonly maintenanceRepository: Repository<ResourceMaintenance>;

  protected abstract readonly resourceRepository: Repository<Resource>;

  protected abstract readonly usageRepository: Repository<ResourceUsage>;

  protected abstract readonly operatingAttributionService: ResourceOperatingAttributionService;

  protected abstract readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>;

  protected abstract readonly maintenanceService: ResourceMaintenanceService;

  protected abstract readonly logger: Logger;

  protected abstract readonly cronTimer: CronTimer;

  public abstract evaluateAll(): Promise<void>;

  protected abstract readonly usageEvalMaxWaitMs: 30000;

  protected abstract readonly usageEvalDebounceMs: 5000;

  protected abstract readonly metricsService: MetricsService;

  protected abstract evaluationLock: boolean;

  protected abstract loadScheduleResources(
    allSchedules: ResourceMaintenanceSchedule[],
  ): Promise<{ resourceCreatedAtMap: Map<number, Date>; knownResourceIds: Set<number> }>;

  protected abstract loadScheduleState(
    allSchedules: ResourceMaintenanceSchedule[],
    knownResourceIds: Set<number>,
    resourceCreatedAtMap: Map<number, Date>,
    now: Date,
  ): Promise<{
    pairs: {
      resourceId: number;
      scheduleId: number;
      createdAt: Date;
      triggerType: ResourceMaintenanceScheduleTriggerType;
    }[];
    usageCountBySchedule: Map<string, number>;
    baselineMap: Map<string, Date>;
    activeResourceIds: Set<number>;
    getBaseline: (resourceId: number, scheduleId: number) => Date;
  }>;

  protected abstract loadScheduleDurations(
    allSchedules: ResourceMaintenanceSchedule[],
    pairs: Array<{ resourceId: number; scheduleId: number; triggerType: ResourceMaintenanceScheduleTriggerType }>,
    activeResourceIds: Set<number>,
    getBaseline: (resourceId: number, scheduleId: number) => Date,
    baselineMap: Map<string, Date>,
    now: Date,
  ): Promise<Map<string, ResourceDurations>>;

  protected abstract selectTriggeringSchedules(
    allSchedules: ResourceMaintenanceSchedule[],
    knownResourceIds: Set<number>,
    activeResourceIds: Set<number>,
    getBaseline: (resourceId: number, scheduleId: number) => Date,
    durations: Map<string, ResourceDurations>,
    usageCountBySchedule: Map<string, number>,
    now: Date,
  ): Promise<{ resourceId: number; schedule: ResourceMaintenanceSchedule }[]>;

  protected abstract persistTriggeredSchedules(
    toCreate: Array<{ resourceId: number; schedule: ResourceMaintenanceSchedule }>,
  ): Promise<void>;
}

import { MaintenanceSnapshotReader, captureDurationState } from './snapshot-reader';

import { runSerializedTransaction } from '../../../database/run-serialized-transaction';
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
import { ResourceMaintenanceService } from '../maintenance.service';

/**
 * Evaluates the maintenance schedules of one resource and creates the maintenance a triggered schedule asks for.
 * Tracks running evaluations so shutdown can wait for them.
 */
export class MaintenanceResourceEvaluation {
  private snapshotReader?: MaintenanceSnapshotReader;
  private readonly activeEvaluations = new Set<Promise<void>>();
  private stopped = false;

  constructor(
    private readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>,
    private readonly maintenanceRepository: Repository<ResourceMaintenance>,
    private readonly resourceRepository: Repository<Resource>,
    private readonly usageRepository: Repository<ResourceUsage>,
    private readonly maintenanceService: ResourceMaintenanceService,
    private readonly operatingAttributionService: ResourceOperatingAttributionService,
    private readonly logger: Logger,
    /** Evaluates the resource again later, debounced; used when a snapshot went stale while it was evaluated. */
    private readonly requeue: (resourceId: number) => void,
  ) {}

  get stopping(): boolean {
    return this.stopped;
  }

  /** Refuses new evaluations; {@link drain} then waits for the running ones. */
  beginStop(): void {
    this.stopped = true;
  }

  async drain(): Promise<void> {
    await Promise.allSettled(this.activeEvaluations);
    await this.snapshotReader?.close();
  }

  /**
   * Evaluate all enabled schedules for a resource. If any triggers and there is no active maintenance, create one (first trigger wins).
   */
  async evaluateResource(resourceId: number): Promise<void> {
    if (this.stopped) return;
    const evaluation = this.evaluateResourceInternal(resourceId);
    this.activeEvaluations.add(evaluation);
    try {
      await evaluation;
    } finally {
      this.activeEvaluations.delete(evaluation);
    }
  }

  private async evaluateResourceInternal(resourceId: number): Promise<void> {
    // Avoid opening a SQLite transaction alongside session writes when no
    // enabled schedule can produce maintenance. Re-read inside for correctness.
    if (!(await this.scheduleRepository.existsBy({ resourceId, enabled: true }))) return;
    if (this.scheduleRepository.manager.connection?.options.type === 'sqlite') {
      await this.evaluateResourceSnapshot(resourceId);
      return;
    }
    let createdMaintenanceId: number | undefined;
    await runSerializedTransaction(this.scheduleRepository.manager, async (transactionalEntityManager) => {
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

  /** Read history independently; only validate the resource's mutable state and write in the usage queue. */
  private async evaluateResourceSnapshot(resourceId: number): Promise<void> {
    this.snapshotReader ??= new MaintenanceSnapshotReader(this.scheduleRepository.manager.connection);
    const reader = await this.snapshotReader.manager();
    if (await this.maintenanceService.hasActiveMaintenance(resourceId, reader)) return;
    const schedules = await reader.getRepository(ResourceMaintenanceSchedule).find({
      where: { resourceId, enabled: true },
      relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
    });
    const candidates: Array<{
      schedule: ResourceMaintenanceSchedule;
      definition: string;
      baseline: number;
      durationState: string;
    }> = [];
    for (const schedule of schedules) {
      const definition = JSON.stringify(schedule);
      const baseline = (await this.getBaselineDate(resourceId, schedule.id, reader)).getTime();
      const durationState =
        schedule.triggerType === ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL
          ? ''
          : await captureDurationState(resourceId, reader);
      if (await this.shouldTrigger(schedule, resourceId, reader)) {
        candidates.push({ schedule, definition, baseline, durationState });
      }
    }
    if (candidates.length === 0) return;

    let stale = false;
    const created = await runSerializedTransaction(this.scheduleRepository.manager, async (manager) => {
      // This read establishes the SQLite transaction snapshot before freshness checks.
      if (await this.maintenanceService.hasActiveMaintenance(resourceId, manager)) return;
      const currentSchedules = await manager.getRepository(ResourceMaintenanceSchedule).find({
        where: { resourceId, enabled: true },
        relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
      });
      for (const candidate of candidates) {
        const current = currentSchedules.find((schedule) => schedule.id === candidate.schedule.id);
        if (
          !current ||
          JSON.stringify(current) !== candidate.definition ||
          (await this.getBaselineDate(resourceId, current.id, manager)).getTime() !== candidate.baseline ||
          (candidate.durationState !== '' &&
            (await captureDurationState(resourceId, manager)) !== candidate.durationState)
        ) {
          stale = true;
          continue;
        }
        return this.maintenanceService.createMaintenanceFromSchedule(
          resourceId,
          current.id,
          this.buildMaintenanceReasonFromScheduleDefinition(current),
          manager,
          false,
        );
      }
    });
    if (created) this.maintenanceService.emitScheduledMaintenanceCreated(resourceId, created.id);
    // Recompute changed resources outside the queue; unrelated resource writes never invalidate this work.
    else if (stale) this.requeue(resourceId);
  }

  /**
   * Builds the schedule's reason as JSON for i18n: { i18nKey, details }.
   * Stored in maintenance.reason; describes what triggered this maintenance (the schedule).
   * Frontend keys: name.auto.usageHours, name.auto.usageCount, name.auto.intervalDays,
   * name.auto.thresholdHours, name.auto.fallback
   */
  buildMaintenanceReasonFromScheduleDefinition(schedule: ResourceMaintenanceSchedule): string {
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
  durationToMs(duration: number, unit: UsageDurationUnit): number {
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
  evaluateTriggerThreshold(
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

  selectedDuration(schedule: ResourceMaintenanceSchedule, durations?: ResourceDurations): number {
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
  async getUsageSessionCountSince(resourceId: number, since: Date, manager?: EntityManager): Promise<number> {
    return (manager?.getRepository(ResourceUsage) ?? this.usageRepository)
      .createQueryBuilder('usage')
      .where('usage.resourceId = :resourceId', { resourceId })
      .andWhere('usage.lifecyclePending = :lifecyclePending', { lifecyclePending: false })
      .andWhere('usage.endTime IS NOT NULL')
      .andWhere('usage.endTime >= :since', { since })
      .getCount();
  }
}

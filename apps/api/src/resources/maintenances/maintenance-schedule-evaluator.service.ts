import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  Resource,
  ResourceUsage,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';

/**
 * Evaluates maintenance schedules and creates ResourceMaintenance when a schedule's condition is met.
 * Baseline for all trigger types: when the last maintenance created by this schedule was marked done
 * (that maintenance's endTime/completedAt). If none, uses resource.createdAt.
 *
 * Runs via cron (periodic) and on usage events (session ended) so USAGE_HOURS and USAGE_COUNT triggers take effect immediately.
 */
@Injectable()
export class MaintenanceScheduleEvaluatorService {
  private readonly logger = new Logger(MaintenanceScheduleEvaluatorService.name);
  private evaluationLock = false;

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
  ) { }

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
  async getUsageMinutesSince(resourceId: number, since: Date): Promise<number> {
    const result = await this.usageRepository
      .createQueryBuilder('usage')
      .select('COALESCE(SUM(usage.usageInMinutes), 0)', 'total')
      .where('usage.resourceId = :resourceId', { resourceId })
      .andWhere('usage.endTime IS NOT NULL')
      .andWhere('usage.endTime >= :since', { since })
      .getRawOne<{ total: string }>();

    return parseInt(result?.total ?? '0', 10);
  }

  /**
   * Count usage sessions for the resource since baseline (completed sessions only).
   */
  async getUsageSessionCountSince(resourceId: number, since: Date): Promise<number> {
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
   * Returns true if the schedule's condition is met.
   */
  async shouldTrigger(schedule: ResourceMaintenanceSchedule, resourceId: number): Promise<boolean> {
    const baseline = await this.getBaselineDate(resourceId, schedule.id);
    const now = new Date();

    switch (schedule.triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
        const config = schedule.usageHoursConfig;
        if (!config) return false;
        const minutes = await this.getUsageMinutesSince(resourceId, baseline);
        const thresholdMinutes = this.durationToMinutes(config.duration, config.unit);
        return minutes >= thresholdMinutes;
      }
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT: {
        const config = schedule.usageCountConfig;
        if (!config) return false;
        const count = await this.getUsageSessionCountSince(resourceId, baseline);
        return count >= config.thresholdSessions;
      }
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
        const config = schedule.timeIntervalConfig;
        if (!config) return false;
        const durationMinutes = this.durationToMinutes(config.duration, config.unit);
        const elapsedMinutes = (now.getTime() - baseline.getTime()) / (60 * 1000);
        return elapsedMinutes >= durationMinutes;
      }
      default:
        return false;
    }
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
        const hasActiveMaintenanceOfThisSchedule = await this.maintenanceService.hasActiveMaintenance({ resourceId, scheduleId: schedule.id }, transactionalEntityManager);
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
   */
  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  async onResourceUsage(event: ResourceSessionStartedEvent): Promise<void> {
    const resourceId = event.usage?.resource?.id;
    if (resourceId == null) return;
    // Only re-evaluate when a session was ended (endTime set); that's when usage minutes and session count increase.
    if (event.usage.endTime == null) return;

    try {
      await this.evaluateResource(resourceId);
    } catch (err) {
      this.logger.error(
        `Error evaluating schedules for resource ${resourceId} after usage event: ${err}`,
        (err as Error)?.stack,
      );
    }
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
   * Evaluate all resources that have at least one enabled schedule. Uses a simple in-process lock to avoid overlapping runs.
   */
  async evaluateAll(): Promise<void> {
    if (this.evaluationLock) {
      this.logger.debug('Schedule evaluation already in progress, skipping');
      return;
    }
    this.evaluationLock = true;
    try {
      const schedules = await this.scheduleRepository.find({
        where: { enabled: true },
        select: ['id', 'resourceId'],
      });
      const resourceIds = [...new Set(schedules.map((s) => s.resourceId))];
      for (const resourceId of resourceIds) {
        try {
          await this.evaluateResource(resourceId);
        } catch (err) {
          this.logger.error(`Error evaluating schedules for resource ${resourceId}: ${err}`, (err as Error)?.stack);
        }
      }
    } finally {
      this.evaluationLock = false;
    }
  }
}

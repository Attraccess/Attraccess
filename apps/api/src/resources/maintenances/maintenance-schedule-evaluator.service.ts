import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  Resource,
  ResourceUsage,
} from '@attraccess/database-entities';
import { ResourceMaintenanceService } from './maintenance.service';

/**
 * Evaluates maintenance schedules and creates ResourceMaintenance when a schedule's condition is met.
 * Baseline for all trigger types: when the last maintenance created by this schedule was marked done
 * (that maintenance's endTime/completedAt). If none, uses resource.createdAt.
 *
 * Runs via cron (periodic) and optionally can be called on usage events.
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
        return minutes >= config.thresholdMinutes;
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
        if (config.intervalDays != null && config.intervalDays > 0) {
          const nextDue = new Date(baseline);
          nextDue.setDate(nextDue.getDate() + config.intervalDays);
          return now >= nextDue;
        }
        if (config.thresholdHours != null && config.thresholdHours > 0) {
          const elapsedMs = now.getTime() - baseline.getTime();
          const elapsedHours = elapsedMs / (1000 * 60 * 60);
          return elapsedHours >= config.thresholdHours;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * Evaluate all enabled schedules for a resource. If any triggers and there is no active maintenance, create one (first trigger wins).
   */
  async evaluateResource(resourceId: number): Promise<void> {
    const hasActive = await this.maintenanceService.hasActiveMaintenance(resourceId);
    if (hasActive) return;

    const schedules = await this.scheduleRepository.find({
      where: { resourceId, enabled: true },
      relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
    });

    for (const schedule of schedules) {
      const triggers = await this.shouldTrigger(schedule, resourceId);
      if (!triggers) continue;

      // Re-check active maintenance (another schedule might have just created one)
      const stillNoActive = !(await this.maintenanceService.hasActiveMaintenance(resourceId));
      if (!stillNoActive) break;

      const reason = this.buildReason(schedule);
      await this.maintenanceService.createMaintenanceFromSchedule(resourceId, schedule.id, reason);
      this.logger.log(
        `Schedule ${schedule.id} triggered for resource ${resourceId}: created maintenance. Reason: ${reason}`,
      );
      break; // Only one maintenance at a time
    }
  }

  /**
   * Builds a reason string as JSON for i18n: { i18nKey, details }.
   * Frontend can parse and use t(i18nKey, details). Keys used:
   * - reason.auto.usageHours    (details: hours, scheduleName?)
   * - reason.auto.usageCount    (details: count, scheduleName?)
   * - reason.auto.intervalDays  (details: days, scheduleName?)
   * - reason.auto.thresholdHours (details: hours, scheduleName?)
   * - reason.auto.fallback      (details: scheduleId, scheduleName?)
   */
  private buildReason(schedule: ResourceMaintenanceSchedule): string {
    const scheduleName = schedule.name ?? undefined;
    const withParams = (details: Record<string, number | string | undefined>) => ({
      i18nKey: '' as string,
      details: { ...details, ...(scheduleName && { scheduleName }) },
    });

    switch (schedule.triggerType) {
      case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
        const c = schedule.usageHoursConfig;
        const hours = c ? Math.round(c.thresholdMinutes / 60) : 0;
        return JSON.stringify({ ...withParams({ hours }), i18nKey: 'reason.auto.usageHours' });
      }
      case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT: {
        const c = schedule.usageCountConfig;
        const count = c?.thresholdSessions ?? 0;
        return JSON.stringify({ ...withParams({ count }), i18nKey: 'reason.auto.usageCount' });
      }
      case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
        const c = schedule.timeIntervalConfig;
        if (c?.intervalDays != null) {
          return JSON.stringify({
            ...withParams({ days: c.intervalDays }),
            i18nKey: 'reason.auto.intervalDays',
          });
        }
        if (c?.thresholdHours != null) {
          return JSON.stringify({
            ...withParams({ hours: c.thresholdHours }),
            i18nKey: 'reason.auto.thresholdHours',
          });
        }
        return JSON.stringify({
          ...withParams({ scheduleId: schedule.id }),
          i18nKey: 'reason.auto.fallback',
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
    await this.evaluateAll();
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

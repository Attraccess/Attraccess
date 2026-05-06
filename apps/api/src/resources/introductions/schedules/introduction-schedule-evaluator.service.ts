// Evaluator for introduction schedules: baseline + dueAt + isDue + isWarning + tick
// FEATURE: User retraining requirement (ATT-106)
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTriggerType,
  ResourceIntroductionScheduleInactivityScope,
  RetrainingIntervalUnit,
  ResourceUsage,
  Resource,
  ResourceGroup,
  User,
} from '@attraccess/database-entities';
import { ResourceIntroductionChangedEvent } from '../events/resource-introduction-changed.event';
import { EmailService } from '../../../email/email.service';

export type IntroductionStatus = 'ACTIVE' | 'WARNING' | 'EXPIRED';

export interface ScheduleEvaluationRow {
  scheduleId: number;
  dueAt: Date | null;
  isWarning: boolean;
  isDue: boolean;
  blockAccess: boolean;
}

export interface EvaluateUserOnResourceResult {
  status: IntroductionStatus;
  expiresAt: Date | null;
  schedules: ScheduleEvaluationRow[];
}

const MS_PER_DAY = 86_400_000;

function addInterval(d: Date, duration: number, unit: RetrainingIntervalUnit): Date {
  const r = new Date(d);
  switch (unit) {
    case RetrainingIntervalUnit.DAYS:
      r.setUTCDate(r.getUTCDate() + duration);
      break;
    case RetrainingIntervalUnit.WEEKS:
      r.setUTCDate(r.getUTCDate() + duration * 7);
      break;
    case RetrainingIntervalUnit.MONTHS:
      r.setUTCMonth(r.getUTCMonth() + duration);
      break;
    case RetrainingIntervalUnit.YEARS:
      r.setUTCFullYear(r.getUTCFullYear() + duration);
      break;
  }
  return r;
}

@Injectable()
export class IntroductionScheduleEvaluatorService {
  private tickInFlight = false;

  constructor(
    @InjectRepository(ResourceIntroduction)
    private readonly introRepo: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    private readonly histRepo: Repository<ResourceIntroductionHistoryItem>,
    @InjectRepository(ResourceIntroductionSchedule)
    private readonly schedRepo: Repository<ResourceIntroductionSchedule>,
    @InjectRepository(ResourceUsage)
    private readonly usageRepo: Repository<ResourceUsage>,
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceGroup)
    private readonly resourceGroupRepo: Repository<ResourceGroup>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    private readonly emailService: EmailService
  ) {}

  async computeBaseline(introduction: ResourceIntroduction): Promise<Date> {
    const lastRenew = await this.histRepo.findOne({
      where: { introductionId: introduction.id, action: IntroductionHistoryAction.RENEW },
      order: { createdAt: 'DESC' },
    });
    const completedAt =
      introduction.completedAt instanceof Date ? introduction.completedAt : new Date(introduction.completedAt);
    if (!lastRenew) return completedAt;
    return lastRenew.createdAt > completedAt ? lastRenew.createdAt : completedAt;
  }

  private async lastUsageOnResource(userId: number, resourceId: number): Promise<Date | null> {
    const u = await this.usageRepo.findOne({
      where: { resourceId, userId },
      order: { startTime: 'DESC' },
    });
    return u?.startTime ?? null;
  }

  private async lastUsageInGroup(userId: number, groupId: number): Promise<Date | null> {
    const resources = await this.resourceRepo.find({
      where: { groups: { id: groupId } } as FindOptionsWhere<Resource>,
      relations: ['groups'],
    });
    if (resources.length === 0) return null;
    const u = await this.usageRepo.findOne({
      where: { resourceId: In(resources.map((r) => r.id)), userId },
      order: { startTime: 'DESC' },
    });
    return u?.startTime ?? null;
  }

  async computeDueAt(
    schedule: ResourceIntroductionSchedule,
    introduction: ResourceIntroduction
  ): Promise<Date | null> {
    const baseline = await this.computeBaseline(introduction);
    if (schedule.triggerType === ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION) {
      const cfg = schedule.timeSinceIntroductionConfig;
      if (!cfg) return null;
      return addInterval(baseline, cfg.duration, cfg.unit);
    }
    const cfg = schedule.inactivityConfig;
    if (!cfg) return null;
    let lastUsage: Date | null = null;
    if (cfg.scope === ResourceIntroductionScheduleInactivityScope.RESOURCE) {
      const resourceId = schedule.resourceId ?? introduction.resourceId;
      if (resourceId == null) return null;
      lastUsage = await this.lastUsageOnResource(introduction.receiverUserId, resourceId);
    } else {
      const groupId = schedule.resourceGroupId;
      if (groupId == null) return null;
      lastUsage = await this.lastUsageInGroup(introduction.receiverUserId, groupId);
    }
    const reference = lastUsage && lastUsage > baseline ? lastUsage : baseline;
    return addInterval(reference, cfg.duration, cfg.unit);
  }

  async isDue(
    schedule: ResourceIntroductionSchedule,
    introduction: ResourceIntroduction,
    now = new Date()
  ): Promise<boolean> {
    const due = await this.computeDueAt(schedule, introduction);
    if (!due) return false;
    return now.getTime() >= due.getTime();
  }

  async isWarning(
    schedule: ResourceIntroductionSchedule,
    introduction: ResourceIntroduction,
    now = new Date()
  ): Promise<boolean> {
    if (!schedule.warnDaysBefore || schedule.warnDaysBefore <= 0) return false;
    const due = await this.computeDueAt(schedule, introduction);
    if (!due) return false;
    if (now.getTime() >= due.getTime()) return false;
    const warnFrom = due.getTime() - schedule.warnDaysBefore * MS_PER_DAY;
    return now.getTime() >= warnFrom;
  }

  async getSchedulesForIntroduction(introduction: ResourceIntroduction): Promise<ResourceIntroductionSchedule[]> {
    const resourceId = introduction.resourceId;
    const groupId = introduction.resourceGroupId;
    const where: FindOptionsWhere<ResourceIntroductionSchedule>[] = [];
    if (resourceId != null) where.push({ resourceId, enabled: true });
    if (groupId != null) where.push({ resourceGroupId: groupId, enabled: true });
    if (resourceId != null) {
      const groups = await this.resourceRepo.findOne({
        where: { id: resourceId },
        relations: ['groups'],
      });
      for (const g of groups?.groups ?? []) {
        where.push({ resourceGroupId: g.id, enabled: true });
      }
    }
    if (where.length === 0) return [];
    return this.schedRepo.find({
      where,
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
  }

  async isBlockedByExpiry(introduction: ResourceIntroduction, now = new Date()): Promise<boolean> {
    const schedules = await this.getSchedulesForIntroduction(introduction);
    for (const s of schedules) {
      if (!s.blockAccess) continue;
      if (await this.isDue(s, introduction, now)) return true;
    }
    return false;
  }

  async evaluateUserOnResource(
    userId: number,
    resourceId: number,
    now = new Date()
  ): Promise<EvaluateUserOnResourceResult> {
    const intro = await this.introRepo.findOne({
      where: { resourceId, receiverUserId: userId },
    });
    if (!intro) return { status: 'ACTIVE', expiresAt: null, schedules: [] };
    return this.evaluateIntroduction(intro, now);
  }

  async evaluateUserOnGroup(
    userId: number,
    resourceGroupId: number,
    now = new Date()
  ): Promise<EvaluateUserOnResourceResult> {
    const intro = await this.introRepo.findOne({
      where: { resourceGroupId, receiverUserId: userId },
    });
    if (!intro) return { status: 'ACTIVE', expiresAt: null, schedules: [] };
    return this.evaluateIntroduction(intro, now);
  }

  async evaluateIntroduction(
    intro: ResourceIntroduction,
    now = new Date()
  ): Promise<EvaluateUserOnResourceResult> {
    const schedules = await this.getSchedulesForIntroduction(intro);
    const rows = await Promise.all(
      schedules.map(async (s) => {
        const due = await this.computeDueAt(s, intro);
        return {
          scheduleId: s.id,
          dueAt: due,
          isDue: !!due && now.getTime() >= due.getTime(),
          isWarning: await this.isWarning(s, intro, now),
          blockAccess: s.blockAccess,
        };
      })
    );
    const earliest =
      rows
        .map((r) => r.dueAt)
        .filter((d): d is Date => !!d)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    let status: IntroductionStatus = 'ACTIVE';
    if (rows.some((r) => r.isDue)) status = 'EXPIRED';
    else if (rows.some((r) => r.isWarning)) status = 'WARNING';
    return { status, expiresAt: earliest, schedules: rows };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async tick(now = new Date()): Promise<void> {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      const schedules = await this.schedRepo.find({
        where: { enabled: true },
        relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
      });
      for (const s of schedules) {
        const intros = await this.findIntroductionsForSchedule(s);
        for (const intro of intros) {
          const dueAt = await this.computeDueAt(s, intro);
          if (!dueAt) continue;
          if (now.getTime() >= dueAt.getTime()) await this.recordExpireOnce(s, intro);
          else if (await this.isWarning(s, intro, now)) await this.recordWarnSentOnce(s, intro, dueAt);
        }
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private async findIntroductionsForSchedule(s: ResourceIntroductionSchedule): Promise<ResourceIntroduction[]> {
    if (s.resourceId != null) {
      return this.introRepo.find({ where: { resourceId: s.resourceId } });
    }
    if (s.resourceGroupId != null) {
      return this.introRepo.find({ where: { resourceGroupId: s.resourceGroupId } });
    }
    return [];
  }

  private async recordExpireOnce(
    s: ResourceIntroductionSchedule,
    intro: ResourceIntroduction
  ): Promise<void> {
    if (await this.alreadyEmittedThisCycle(intro.id, s.id, IntroductionHistoryAction.EXPIRE)) return;
    await this.histRepo.save(
      this.histRepo.create({
        introductionId: intro.id,
        action: IntroductionHistoryAction.EXPIRE,
        performedByUserId: null,
        scheduleId: s.id,
      })
    );
    this.events.emit(
      ResourceIntroductionChangedEvent.EVENT_NAME,
      new ResourceIntroductionChangedEvent(intro.id)
    );
    await this.dispatchExpiredEmail(s, intro);
  }

  private async recordWarnSentOnce(
    s: ResourceIntroductionSchedule,
    intro: ResourceIntroduction,
    dueAt: Date
  ): Promise<void> {
    if (await this.alreadyEmittedThisCycle(intro.id, s.id, IntroductionHistoryAction.WARN_SENT)) return;
    await this.histRepo.save(
      this.histRepo.create({
        introductionId: intro.id,
        action: IntroductionHistoryAction.WARN_SENT,
        performedByUserId: null,
        scheduleId: s.id,
      })
    );
    this.events.emit(
      ResourceIntroductionChangedEvent.EVENT_NAME,
      new ResourceIntroductionChangedEvent(intro.id)
    );
    await this.dispatchWarningEmail(s, intro, dueAt);
  }

  private async resolveTarget(
    s: ResourceIntroductionSchedule,
    intro: ResourceIntroduction
  ): Promise<{ user: User; target: { name: string } } | null> {
    const user = await this.userRepo.findOne({ where: { id: intro.receiverUserId } });
    if (!user || !user.email) return null;
    const resourceId = s.resourceId ?? intro.resourceId;
    if (resourceId != null) {
      const resource = await this.resourceRepo.findOne({ where: { id: resourceId } });
      if (!resource) return null;
      return { user, target: { name: resource.name } };
    }
    const groupId = s.resourceGroupId ?? intro.resourceGroupId;
    if (groupId != null) {
      const group = await this.resourceGroupRepo.findOne({ where: { id: groupId } });
      if (!group) return null;
      return { user, target: { name: group.name } };
    }
    return null;
  }

  private async dispatchExpiredEmail(
    s: ResourceIntroductionSchedule,
    intro: ResourceIntroduction
  ): Promise<void> {
    const resolved = await this.resolveTarget(s, intro);
    if (!resolved) return;
    try {
      await this.emailService.sendIntroductionExpiredEmail(resolved.user, resolved.target);
    } catch {
      void 0;
    }
  }

  private async dispatchWarningEmail(
    s: ResourceIntroductionSchedule,
    intro: ResourceIntroduction,
    dueAt: Date
  ): Promise<void> {
    const resolved = await this.resolveTarget(s, intro);
    if (!resolved) return;
    try {
      await this.emailService.sendIntroductionExpiryWarningEmail(resolved.user, resolved.target, dueAt);
    } catch {
      void 0;
    }
  }

  private async alreadyEmittedThisCycle(
    introductionId: number,
    scheduleId: number,
    action: IntroductionHistoryAction
  ): Promise<boolean> {
    const exists = await this.histRepo.findOne({
      where: { introductionId, action, scheduleId },
      order: { id: 'DESC' },
    });
    if (!exists) return false;
    const laterRenew = await this.histRepo.findOne({
      where: { introductionId, action: IntroductionHistoryAction.RENEW },
      order: { id: 'DESC' },
    });
    if (laterRenew && laterRenew.id > exists.id) return false;
    return true;
  }
}

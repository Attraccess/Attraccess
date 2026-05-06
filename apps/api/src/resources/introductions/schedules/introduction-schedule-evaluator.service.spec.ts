// Unit tests for the IntroductionScheduleEvaluatorService
// FEATURE: User retraining requirement (ATT-106)
import { Test } from '@nestjs/testing';
import { DataSource, DeepPartial } from 'typeorm';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import {
  Resource,
  ResourceGroup,
  ResourceUsage,
  ResourceUsageAction,
  User,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTriggerType,
  ResourceIntroductionScheduleInactivityScope,
  RetrainingIntervalUnit,
  ResourceType,
  entities,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IntroductionScheduleEvaluatorService } from './introduction-schedule-evaluator.service';
import { EmailService } from '../../../email/email.service';

const fixedNow = new Date('2026-05-05T00:00:00.000Z');

describe('IntroductionScheduleEvaluatorService', () => {
  let ds: DataSource;
  let svc: IntroductionScheduleEvaluatorService;
  let userId: number;
  let resourceId: number;
  let introductionId: number;
  let emailService: {
    sendIntroductionExpiryWarningEmail: jest.Mock;
    sendIntroductionExpiredEmail: jest.Mock;
  };

  beforeEach(async () => {
    emailService = {
      sendIntroductionExpiryWarningEmail: jest.fn().mockResolvedValue(undefined),
      sendIntroductionExpiredEmail: jest.fn().mockResolvedValue(undefined),
    };
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: Object.values(entities),
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          Resource,
          ResourceGroup,
          ResourceUsage,
          User,
          ResourceIntroduction,
          ResourceIntroductionHistoryItem,
          ResourceIntroductionSchedule,
          ResourceIntroductionScheduleTimeSinceIntroductionConfig,
          ResourceIntroductionScheduleInactivityConfig,
        ]),
      ],
      providers: [
        IntroductionScheduleEvaluatorService,
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    ds = mod.get(getDataSourceToken());
    svc = mod.get(IntroductionScheduleEvaluatorService);

    const userPayload: DeepPartial<User> = { username: 'u', email: 'u@u.test' };
    const user = await ds.getRepository(User).save(userPayload);
    userId = user.id;
    const res = await ds.getRepository(Resource).save({ name: 'R1', type: ResourceType.Machine });
    resourceId = res.id;
    const introPayload: DeepPartial<ResourceIntroduction> = {
      resource: res,
      receiverUserId: userId,
      completedAt: new Date('2025-05-05T00:00:00.000Z'),
    };
    const intro = await ds.getRepository(ResourceIntroduction).save(introPayload);
    introductionId = intro.id;
    await ds.getRepository(ResourceIntroductionHistoryItem).save({
      introductionId,
      action: IntroductionHistoryAction.GRANT,
      performedByUserId: userId,
      createdAt: new Date('2025-05-05T00:00:00.000Z'),
    });
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('baseline = completedAt with no RENEW', async () => {
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const baseline = await svc.computeBaseline(intro);
    expect(baseline.toISOString()).toBe('2025-05-05T00:00:00.000Z');
  });

  it('baseline = latest RENEW createdAt', async () => {
    await ds.getRepository(ResourceIntroductionHistoryItem).save({
      introductionId,
      action: IntroductionHistoryAction.RENEW,
      performedByUserId: userId,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    expect((await svc.computeBaseline(intro)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  async function makeTimeSchedule(opts: {
    duration: number;
    unit: RetrainingIntervalUnit;
    blockAccess?: boolean;
    warnDaysBefore?: number;
  }): Promise<ResourceIntroductionSchedule> {
    const schedulePayload: DeepPartial<ResourceIntroductionSchedule> = {
      resourceId,
      triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: opts.blockAccess ?? false,
      warnDaysBefore: opts.warnDaysBefore ?? 0,
      enabled: true,
    };
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save(schedulePayload);
    await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
      scheduleId: schedule.id,
      duration: opts.duration,
      unit: opts.unit,
    });
    return ds.getRepository(ResourceIntroductionSchedule).findOneOrFail({
      where: { id: schedule.id },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
  }

  it('TIME_SINCE_INTRODUCTION dueAt = baseline + duration', async () => {
    const schedule = await makeTimeSchedule({ duration: 1, unit: RetrainingIntervalUnit.YEARS });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const dueAt = await svc.computeDueAt(schedule, intro);
    expect(dueAt?.toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });

  it('isDue boundary: dueAt-1ms = false, dueAt = true', async () => {
    const schedule = await makeTimeSchedule({
      duration: 1,
      unit: RetrainingIntervalUnit.YEARS,
      blockAccess: true,
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const justBefore = new Date(fixedNow.getTime() - 1);
    expect(await svc.isDue(schedule, intro, justBefore)).toBe(false);
    expect(await svc.isDue(schedule, intro, fixedNow)).toBe(true);
  });

  it('isWarning fires inside warnDaysBefore window only', async () => {
    const schedule = await makeTimeSchedule({
      duration: 1,
      unit: RetrainingIntervalUnit.YEARS,
      warnDaysBefore: 30,
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    expect(await svc.isWarning(schedule, intro, new Date('2026-04-04T00:00:00.000Z'))).toBe(false);
    expect(await svc.isWarning(schedule, intro, new Date('2026-04-06T00:00:00.000Z'))).toBe(true);
    expect(await svc.isWarning(schedule, intro, fixedNow)).toBe(false);
  });

  it('INACTIVITY scope=RESOURCE: usage on this resource resets baseline', async () => {
    const usagePayload: DeepPartial<ResourceUsage> = {
      resourceId,
      userId,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-04-01T00:00:00.000Z'),
      endTime: new Date('2026-04-01T01:00:00.000Z'),
    };
    await ds.getRepository(ResourceUsage).save(usagePayload);
    const schedulePayload: DeepPartial<ResourceIntroductionSchedule> = {
      resourceId,
      triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      blockAccess: true,
      warnDaysBefore: 0,
      enabled: true,
    };
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save(schedulePayload);
    await ds.getRepository(ResourceIntroductionScheduleInactivityConfig).save({
      scheduleId: schedule.id,
      duration: 6,
      unit: RetrainingIntervalUnit.MONTHS,
      scope: ResourceIntroductionScheduleInactivityScope.RESOURCE,
    });
    const full = await ds.getRepository(ResourceIntroductionSchedule).findOneOrFail({
      where: { id: schedule.id },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const due = await svc.computeDueAt(full, intro);
    expect(due?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('INACTIVITY scope=GROUP: usage on sibling resource resets baseline', async () => {
    const groupPayload: DeepPartial<ResourceGroup> = { name: 'G' };
    const group = await ds.getRepository(ResourceGroup).save(groupPayload);
    const sibling = await ds.getRepository(Resource).save({ name: 'R2', type: ResourceType.Machine });
    await ds.createQueryBuilder().relation(Resource, 'groups').of(sibling.id).add(group.id);
    await ds.createQueryBuilder().relation(Resource, 'groups').of(resourceId).add(group.id);
    const usagePayload: DeepPartial<ResourceUsage> = {
      resourceId: sibling.id,
      userId,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-04-01T00:00:00.000Z'),
      endTime: new Date('2026-04-01T01:00:00.000Z'),
    };
    await ds.getRepository(ResourceUsage).save(usagePayload);
    const schedulePayload: DeepPartial<ResourceIntroductionSchedule> = {
      resourceGroupId: group.id,
      triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      blockAccess: true,
      warnDaysBefore: 0,
      enabled: true,
    };
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save(schedulePayload);
    await ds.getRepository(ResourceIntroductionScheduleInactivityConfig).save({
      scheduleId: schedule.id,
      duration: 6,
      unit: RetrainingIntervalUnit.MONTHS,
      scope: ResourceIntroductionScheduleInactivityScope.GROUP,
    });
    const full = await ds.getRepository(ResourceIntroductionSchedule).findOneOrFail({
      where: { id: schedule.id },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const due = await svc.computeDueAt(full, intro);
    expect(due?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  describe('tick()', () => {
    it('emits one EXPIRE per (schedule, cycle) and is idempotent on rerun', async () => {
      const schedulePayload: DeepPartial<ResourceIntroductionSchedule> = {
        resourceId,
        triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
        blockAccess: true,
        warnDaysBefore: 0,
        enabled: true,
      };
      const schedule = await ds.getRepository(ResourceIntroductionSchedule).save(schedulePayload);
      await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
        scheduleId: schedule.id,
        duration: 1,
        unit: RetrainingIntervalUnit.YEARS,
      });
      await svc.tick(fixedNow);
      await svc.tick(fixedNow);
      const expires = await ds.getRepository(ResourceIntroductionHistoryItem).find({
        where: { action: IntroductionHistoryAction.EXPIRE, introductionId },
      });
      expect(expires).toHaveLength(1);
      expect(expires[0].scheduleId).toBe(schedule.id);
      expect(expires[0].performedByUserId).toBeNull();
      expect(emailService.sendIntroductionExpiredEmail).toHaveBeenCalledTimes(1);
      const [emailedUser, emailedResource] = emailService.sendIntroductionExpiredEmail.mock.calls[0];
      expect(emailedUser.id).toBe(userId);
      expect(emailedResource).toEqual({ name: 'R1' });
      expect(emailService.sendIntroductionExpiryWarningEmail).not.toHaveBeenCalled();
    });

    it('after RENEW, second cycle emits a new EXPIRE', async () => {
      const schedulePayload: DeepPartial<ResourceIntroductionSchedule> = {
        resourceId,
        triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
        blockAccess: true,
        warnDaysBefore: 0,
        enabled: true,
      };
      const schedule = await ds.getRepository(ResourceIntroductionSchedule).save(schedulePayload);
      await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
        scheduleId: schedule.id,
        duration: 1,
        unit: RetrainingIntervalUnit.YEARS,
      });
      await svc.tick(fixedNow);
      await ds.getRepository(ResourceIntroductionHistoryItem).save({
        introductionId,
        action: IntroductionHistoryAction.RENEW,
        performedByUserId: userId,
        createdAt: new Date('2026-05-05T00:00:00.000Z'),
      });
      await svc.tick(new Date('2027-05-05T00:00:00.000Z'));
      const expires = await ds.getRepository(ResourceIntroductionHistoryItem).find({
        where: { action: IntroductionHistoryAction.EXPIRE, introductionId },
      });
      expect(expires).toHaveLength(2);
    });

    it('warn sent once per cycle', async () => {
      const schedulePayload: DeepPartial<ResourceIntroductionSchedule> = {
        resourceId,
        triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
        blockAccess: false,
        warnDaysBefore: 30,
        enabled: true,
      };
      const schedule = await ds.getRepository(ResourceIntroductionSchedule).save(schedulePayload);
      await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
        scheduleId: schedule.id,
        duration: 1,
        unit: RetrainingIntervalUnit.YEARS,
      });
      const warningTime = new Date('2026-04-15T00:00:00.000Z');
      await svc.tick(warningTime);
      await svc.tick(warningTime);
      const sent = await ds.getRepository(ResourceIntroductionHistoryItem).find({
        where: { action: IntroductionHistoryAction.WARN_SENT, introductionId },
      });
      expect(sent).toHaveLength(1);
      expect(emailService.sendIntroductionExpiryWarningEmail).toHaveBeenCalledTimes(1);
      const [emailedUser, emailedResource, dueAt] =
        emailService.sendIntroductionExpiryWarningEmail.mock.calls[0];
      expect(emailedUser.id).toBe(userId);
      expect(emailedResource).toEqual({ name: 'R1' });
      expect(dueAt instanceof Date).toBe(true);
      expect((dueAt as Date).toISOString()).toBe('2026-05-05T00:00:00.000Z');
      expect(emailService.sendIntroductionExpiredEmail).not.toHaveBeenCalled();
    });
  });
});

// E2E test for INACTIVITY scope GROUP vs RESOURCE behaviour with sibling usage
// FEATURE: User retraining requirement (ATT-106)
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DataSource, DeepPartial } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IntroductionHistoryAction,
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleInactivityScope,
  ResourceIntroductionScheduleTriggerType,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  RetrainingIntervalUnit,
  User,
} from '@attraccess/database-entities';
import { IntroductionScheduleEvaluatorService } from '../resources/introductions/schedules/introduction-schedule-evaluator.service';

jest.setTimeout(60_000);

describe('Introduction inactivity scope (e2e)', () => {
  let dataSource: DataSource;
  let evaluator: IntroductionScheduleEvaluatorService;
  let createdTempRoot: string | undefined;

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || 'e2e-introduction-inactivity-secret';
    if (!process.env.STORAGE_ROOT) {
      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'attraccess-introduction-inactivity-e2e-'));
      process.env.STORAGE_ROOT = tmpRoot;
      createdTempRoot = tmpRoot;
    }

    const dsModule = await import('../database/datasource');
    dataSource = (dsModule as unknown as { default: DataSource }).default;
    if (!dataSource.isInitialized) await dataSource.initialize();
    await dataSource.runMigrations();

    const emailService = {
      sendIntroductionExpiryWarningEmail: jest.fn().mockResolvedValue(undefined),
      sendIntroductionExpiredEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConstructorParameters<typeof IntroductionScheduleEvaluatorService>[8];

    evaluator = new IntroductionScheduleEvaluatorService(
      dataSource.getRepository(ResourceIntroduction),
      dataSource.getRepository(ResourceIntroductionHistoryItem),
      dataSource.getRepository(ResourceIntroductionSchedule),
      dataSource.getRepository(ResourceUsage),
      dataSource.getRepository(Resource),
      dataSource.getRepository(ResourceGroup),
      dataSource.getRepository(User),
      new EventEmitter2(),
      emailService,
    );
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) await dataSource.destroy();
    if (createdTempRoot) {
      await fs.rm(createdTempRoot, { recursive: true, force: true });
    }
  });

  it('GROUP scope counts sibling usage; RESOURCE scope does not', async () => {
    const seed = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const userRepo = dataSource.getRepository(User);
    const resourceRepo = dataSource.getRepository(Resource);
    const groupRepo = dataSource.getRepository(ResourceGroup);
    const usageRepo = dataSource.getRepository(ResourceUsage);
    const introRepo = dataSource.getRepository(ResourceIntroduction);
    const histRepo = dataSource.getRepository(ResourceIntroductionHistoryItem);
    const schedRepo = dataSource.getRepository(ResourceIntroductionSchedule);
    const inactivityCfgRepo = dataSource.getRepository(ResourceIntroductionScheduleInactivityConfig);

    const userPayload: DeepPartial<User> = {
      username: `inactivity_user_${seed}`,
      email: `inactivity_user_${seed}@example.com`,
    };
    const user = await userRepo.save(userPayload);

    const group = await groupRepo.save({ name: `Inactivity Group ${seed}` });
    const resourceA = await resourceRepo.save({ name: `A_${seed}`, type: ResourceType.Machine });
    const resourceB = await resourceRepo.save({ name: `B_${seed}`, type: ResourceType.Machine });
    await dataSource.createQueryBuilder().relation(Resource, 'groups').of(resourceA.id).add(group.id);
    await dataSource.createQueryBuilder().relation(Resource, 'groups').of(resourceB.id).add(group.id);

    const completedAt = new Date('2025-01-01T00:00:00.000Z');
    const introPayload: DeepPartial<ResourceIntroduction> = {
      resourceGroupId: group.id,
      receiverUserId: user.id,
      tutorUserId: user.id,
      completedAt,
    };
    const intro = await introRepo.save(introPayload);

    await histRepo.save({
      introductionId: intro.id,
      action: IntroductionHistoryAction.GRANT,
      performedByUserId: user.id,
      createdAt: completedAt,
    });

    const usageOnB = new Date('2025-08-01T00:00:00.000Z');
    const usagePayload: DeepPartial<ResourceUsage> = {
      resourceId: resourceB.id,
      userId: user.id,
      usageAction: ResourceUsageAction.Usage,
      startTime: usageOnB,
      endTime: new Date(usageOnB.getTime() + 60 * 60 * 1000),
      isFinalized: true,
    };
    await usageRepo.save(usagePayload);

    const resourceScopeSchedule = await schedRepo.save({
      resourceId: resourceA.id,
      triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      blockAccess: true,
      warnDaysBefore: 0,
      enabled: true,
    });
    await inactivityCfgRepo.save({
      scheduleId: resourceScopeSchedule.id,
      duration: 6,
      unit: RetrainingIntervalUnit.MONTHS,
      scope: ResourceIntroductionScheduleInactivityScope.RESOURCE,
    });

    const groupScopeSchedule = await schedRepo.save({
      resourceGroupId: group.id,
      triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      blockAccess: true,
      warnDaysBefore: 0,
      enabled: true,
    });
    await inactivityCfgRepo.save({
      scheduleId: groupScopeSchedule.id,
      duration: 6,
      unit: RetrainingIntervalUnit.MONTHS,
      scope: ResourceIntroductionScheduleInactivityScope.GROUP,
    });

    const resourceFull = await schedRepo.findOneOrFail({
      where: { id: resourceScopeSchedule.id },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    const groupFull = await schedRepo.findOneOrFail({
      where: { id: groupScopeSchedule.id },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });

    const reloadIntro = await introRepo.findOneByOrFail({ id: intro.id });

    const resourceDue = await evaluator.computeDueAt(resourceFull, reloadIntro);
    const groupDue = await evaluator.computeDueAt(groupFull, reloadIntro);

    expect(resourceDue?.toISOString()).toBe('2025-07-01T00:00:00.000Z');
    expect(groupDue?.toISOString()).toBe('2026-02-01T00:00:00.000Z');

    const checkAt = new Date('2025-09-01T00:00:00.000Z');
    expect(await evaluator.isDue(resourceFull, reloadIntro, checkAt)).toBe(true);
    expect(await evaluator.isDue(groupFull, reloadIntro, checkAt)).toBe(false);

    const resourceOnlyIntro: DeepPartial<ResourceIntroduction> = {
      resource: resourceA,
      receiverUserId: user.id,
      tutorUserId: user.id,
      completedAt,
    };
    const introOnA = await introRepo.save(resourceOnlyIntro);

    const blockedAfterCheck = await evaluator.isBlockedByExpiry(introOnA, checkAt);
    expect(blockedAfterCheck).toBe(true);
  });
});

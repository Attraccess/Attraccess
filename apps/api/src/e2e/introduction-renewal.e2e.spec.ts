// E2E test for introduction renewal lifecycle GRANT to EXPIRE to RENEW
// FEATURE: User retraining requirement (ATT-106)
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DataSource, DeepPartial, Repository } from 'typeorm';
import { Not, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IntroductionHistoryAction,
  Resource,
  ResourceGroup,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceIntroductionScheduleTriggerType,
  ResourceType,
  ResourceUsage,
  RetrainingIntervalUnit,
  User,
} from '@attraccess/database-entities';
import { IntroductionScheduleEvaluatorService } from '../resources/introductions/schedules/introduction-schedule-evaluator.service';

jest.setTimeout(60_000);

interface IntroValidityCheckDeps {
  histRepo: Repository<ResourceIntroductionHistoryItem>;
  introRepo: Repository<ResourceIntroduction>;
  evaluator: IntroductionScheduleEvaluatorService;
}

const hasValidIntroduction = async (
  resourceId: number,
  userId: number,
  deps: IntroValidityCheckDeps,
  now: Date = new Date(),
): Promise<boolean> => {
  const lastNonSystem = await deps.histRepo.findOne({
    where: {
      introduction: { resource: { id: resourceId }, receiverUser: { id: userId } },
      action: Not(In([IntroductionHistoryAction.EXPIRE, IntroductionHistoryAction.WARN_SENT])),
    },
    order: { createdAt: 'DESC' },
  });
  const isActive =
    lastNonSystem?.action === IntroductionHistoryAction.GRANT ||
    lastNonSystem?.action === IntroductionHistoryAction.RENEW;
  if (!isActive) return false;
  const intro = await deps.introRepo.findOne({
    where: { resource: { id: resourceId }, receiverUser: { id: userId } },
  });
  if (!intro) return false;
  const blocked = await deps.evaluator.isBlockedByExpiry(intro, now);
  return !blocked;
};

describe('Introduction renewal (e2e)', () => {
  let dataSource: DataSource;
  let evaluator: IntroductionScheduleEvaluatorService;
  let createdTempRoot: string | undefined;
  let deps: IntroValidityCheckDeps;

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || 'e2e-introduction-renewal-secret';
    if (!process.env.STORAGE_ROOT) {
      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'attraccess-introduction-renewal-e2e-'));
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

    deps = {
      histRepo: dataSource.getRepository(ResourceIntroductionHistoryItem),
      introRepo: dataSource.getRepository(ResourceIntroduction),
      evaluator,
    };
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) await dataSource.destroy();
    if (createdTempRoot) {
      await fs.rm(createdTempRoot, { recursive: true, force: true });
    }
  });

  it('GRANT -> schedule due -> blocked -> RENEW -> restored', async () => {
    const seed = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const userRepo = dataSource.getRepository(User);
    const resourceRepo = dataSource.getRepository(Resource);
    const introRepo = dataSource.getRepository(ResourceIntroduction);
    const histRepo = dataSource.getRepository(ResourceIntroductionHistoryItem);
    const schedRepo = dataSource.getRepository(ResourceIntroductionSchedule);
    const timeCfgRepo = dataSource.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig);

    const userPayload: DeepPartial<User> = {
      username: `renewal_user_${seed}`,
      email: `renewal_user_${seed}@example.com`,
    };
    const user = await userRepo.save(userPayload);

    const resource = await resourceRepo.save({
      name: `Renewal Resource ${seed}`,
      type: ResourceType.Machine,
    });

    const completedAt = new Date('2025-05-05T00:00:00.000Z');
    const introPayload: DeepPartial<ResourceIntroduction> = {
      resource,
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

    const schedule = await schedRepo.save({
      resourceId: resource.id,
      triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: true,
      warnDaysBefore: 0,
      enabled: true,
    });
    await timeCfgRepo.save({
      scheduleId: schedule.id,
      duration: 1,
      unit: RetrainingIntervalUnit.DAYS,
    });

    const reloadIntro = await introRepo.findOneByOrFail({ id: intro.id });
    const beforeDue = new Date(completedAt.getTime() + 12 * 60 * 60 * 1000);
    expect(await evaluator.isBlockedByExpiry(reloadIntro, beforeDue)).toBe(false);
    expect(await hasValidIntroduction(resource.id, user.id, deps, beforeDue)).toBe(true);

    const afterDue = new Date(completedAt.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(await evaluator.isBlockedByExpiry(reloadIntro, afterDue)).toBe(true);

    await histRepo.save({
      introductionId: intro.id,
      action: IntroductionHistoryAction.EXPIRE,
      performedByUserId: null,
      scheduleId: schedule.id,
      createdAt: afterDue,
    });

    expect(await hasValidIntroduction(resource.id, user.id, deps, afterDue)).toBe(false);

    const renewAt = new Date(afterDue.getTime() + 60 * 60 * 1000);
    await histRepo.save({
      introductionId: intro.id,
      action: IntroductionHistoryAction.RENEW,
      performedByUserId: user.id,
      createdAt: renewAt,
    });

    const reloadAfterRenew = await introRepo.findOneByOrFail({ id: intro.id });
    const checkAt = new Date(renewAt.getTime() + 12 * 60 * 60 * 1000);
    expect(await evaluator.isBlockedByExpiry(reloadAfterRenew, checkAt)).toBe(false);
    expect(await hasValidIntroduction(resource.id, user.id, deps, checkAt)).toBe(true);
  });

  it('warn-only schedule does not block usage even when due', async () => {
    const seed = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const userRepo = dataSource.getRepository(User);
    const resourceRepo = dataSource.getRepository(Resource);
    const introRepo = dataSource.getRepository(ResourceIntroduction);
    const histRepo = dataSource.getRepository(ResourceIntroductionHistoryItem);
    const schedRepo = dataSource.getRepository(ResourceIntroductionSchedule);
    const timeCfgRepo = dataSource.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig);

    const userPayload: DeepPartial<User> = {
      username: `warn_user_${seed}`,
      email: `warn_user_${seed}@example.com`,
    };
    const user = await userRepo.save(userPayload);

    const resource = await resourceRepo.save({
      name: `Warn Resource ${seed}`,
      type: ResourceType.Machine,
    });

    const completedAt = new Date('2025-05-05T00:00:00.000Z');
    const introPayload: DeepPartial<ResourceIntroduction> = {
      resource,
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

    const schedule = await schedRepo.save({
      resourceId: resource.id,
      triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: false,
      warnDaysBefore: 30,
      enabled: true,
    });
    await timeCfgRepo.save({
      scheduleId: schedule.id,
      duration: 1,
      unit: RetrainingIntervalUnit.DAYS,
    });

    const reloadIntro = await introRepo.findOneByOrFail({ id: intro.id });
    const afterDue = new Date(completedAt.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(await evaluator.isBlockedByExpiry(reloadIntro, afterDue)).toBe(false);
    expect(await hasValidIntroduction(resource.id, user.id, deps, afterDue)).toBe(true);
  });
});

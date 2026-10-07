import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  FormSubmission,
  Resource,
  ResourceOperatingInterval,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { closeResourceTransactionConnection } from '../../database/run-serialized-transaction';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { ResourceOperatingIntervalService } from '../operating-intervals/resource-operating-interval.service';
import { ResourceUsageService } from './resourceUsage.service';
import { schemas } from './usage-lifecycle-persistence-schema.test-fixture';

// Real repositories and relations for the lifecycle boundary; peripheral domain tables are omitted.

export function registerUsageLifecyclePersistenceAroundExternalFlowsFixture() {
  let directory: string;

  let source: DataSource;

  let usage: ResourceUsageService;

  let operating: ResourceOperatingIntervalService;

  let users: User[];

  let flow: { runFlow: jest.Mock; trackResourceActivity: jest.Mock };

  let billing: {
    getResourceBillingConfiguration: jest.Mock;
    validateResourceUsageStart: jest.Mock;
    handleResourceUsageStart: jest.Mock;
    chargeForResourceUsage: jest.Mock;
    notifyResourceUsageCharge: jest.Mock;
  };

  let maintenance: { hasActiveMaintenance: jest.Mock; canManageMaintenance: jest.Mock };

  const draftItem = {
    name: 'Energy',
    description: 'Pending measurement',
    externalReference: 'meter',
    unitPrice: 2,
    quantity: 3,
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    directory = await mkdtemp(join(tmpdir(), 'attraccess-lifecycle-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'test.sqlite'),
      synchronize: true,
      entities: schemas,
    }).initialize();
    await source.getRepository(Resource).save({
      id: 1,
      name: 'Machine',
      type: ResourceType.Machine,
      allowTakeOver: true,
      supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    });
    users = await source.getRepository(User).save([
      { id: 1, username: 'owner' },
      { id: 2, username: 'next-user' },
    ]);
    users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(['resources.update']) }));
    const events = new EventEmitter2();
    operating = new ResourceOperatingIntervalService(
      source.getRepository(ResourceOperatingInterval),
      {
        recordTransition: jest.fn(),
        setResourceState: jest.fn(),
        recordDataQualityFailures: jest.fn(),
      } as never,
      events,
    );
    flow = { runFlow: jest.fn(), trackResourceActivity: jest.fn() };
    billing = {
      getResourceBillingConfiguration: jest
        .fn()
        .mockResolvedValue({ creditsPerUsage: 5, creditsPerMinute: 2, creditsPerOperatingMinute: 3 }),
      validateResourceUsageStart: jest.fn().mockResolvedValue(undefined),
      handleResourceUsageStart: jest.fn(
        async (_resourceId: number, session: ResourceUsage, user: User, manager: EntityManager) =>
          manager.save(BillingTransaction, {
            resourceUsageId: session.id,
            userId: user.id,
            amount: 0,
            status: BillingTransactionStatus.Pending,
          }),
      ),
      chargeForResourceUsage: jest.fn(async (session: ResourceUsage, manager: EntityManager) => {
        const transaction = await manager.findOneByOrFail(BillingTransaction, { resourceUsageId: session.id });
        await manager.update(BillingTransaction, transaction.id, {
          amount: 23,
          status: BillingTransactionStatus.Completed,
        });
        await manager.decrement(User, { id: session.userId }, 'creditBalance', 23);
        return transaction;
      }),
      notifyResourceUsageCharge: jest.fn().mockResolvedValue(undefined),
    };
    maintenance = {
      hasActiveMaintenance: jest.fn().mockResolvedValue(false),
      canManageMaintenance: jest.fn().mockResolvedValue(false),
    };
    usage = new ResourceUsageService(
      source.getRepository(Resource),
      source.getRepository(ResourceUsage),
      source.getRepository(User),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      maintenance as never,
      events,
      billing as never,
      new ResourceOperatingAttributionService(
        source.getRepository(ResourceOperatingInterval),
        source.getRepository(ResourceUsage),
      ),
      flow as never,
      {} as never,
      {
        prepareRequiredSubmissions: jest.fn(async ({ resourceUsageId, userId, action }) => [
          {
            formId: 11,
            resourceUsageId,
            userId,
            action,
            data: {},
            form: { id: 11, name: 'Safety checklist' },
          },
        ]),
      } as never,
      {
        authorizationCacheRequestsTotal: { inc: jest.fn() },
        authorizationCacheSize: { set: jest.fn() },
        resourceUsageSessionsTotal: { inc: jest.fn() },
        resourceUsageSessionsActive: { inc: jest.fn(), dec: jest.fn() },
        resourceUsageDurationSeconds: { observe: jest.fn() },
      } as never,
      { isResourceUnhealthy: jest.fn().mockResolvedValue(false) } as never,
      { emit: jest.fn() } as never,
      {} as never,
      { recordResource: jest.fn().mockResolvedValue(undefined) } as never,
      null,
    );
  });

  afterEach(async () => {
    usage?.onModuleDestroy();
    if (source) {
      await closeResourceTransactionConnection(source);
      if (source.isInitialized) await source.destroy();
    }
    if (directory) await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  async function seedActiveSession() {
    const session = await source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-19T10:00:00.123Z'),
      startNotes: 'Original session',
      endTime: null,
      isFinalized: true,
      lifecyclePending: false,
    });
    const transaction = await source.getRepository(BillingTransaction).save({
      resourceUsageId: session.id,
      userId: 1,
      amount: 0,
      status: BillingTransactionStatus.Pending,
    });
    await source
      .getRepository(BillingTransactionItem)
      .save({ ...draftItem, billingTransactionId: transaction.id, quantity: 7 });
    return session;
  }

  async function publishedState() {
    return {
      sessions: await source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } }),
      transactions: await source.getRepository(BillingTransaction).find(),
      items: await source.getRepository(BillingTransactionItem).find(),
      users: await source.getRepository(User).find(),
      submissions: await source.getRepository(FormSubmission).find(),
    };
  }

  function failAfterObservation() {
    flow.runFlow.mockImplementation(async (resourceId, _trigger, payload, manager, { lifecycleAttemptId }) => {
      expect(manager).toBeUndefined();
      const attempt = await source
        .getRepository(ResourceUsageLifecycleAttempt)
        .findOneByOrFail({ id: lifecycleAttemptId });
      expect(attempt.formSubmissions).toHaveLength(1);
      if (attempt.candidateUsageId !== null) {
        expect(
          await source.getRepository(ResourceUsage).findOneByOrFail({ id: attempt.candidateUsageId }),
        ).toMatchObject({ lifecyclePending: true, isFinalized: false });
        expect((await usage.getActiveSession(resourceId, false))?.id ?? null).toBe(attempt.previousUsageId);
      }
      await operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'failed-flow',
      });
      await usage.stageLifecycleBillingItem(lifecycleAttemptId, resourceId, payload.id, draftItem);
      expect(
        (await source.getRepository(ResourceUsageLifecycleAttempt).findOneByOrFail({ id: lifecycleAttemptId }))
          .billingItems,
      ).toHaveLength(1);
      throw new ExternalEffectFailureError('Downstream external command failed', new Error('offline'));
    });
  }

  async function expectObservationAndNoAttempt() {
    expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(await source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
    expect(await source.getRepository(ResourceOperatingInterval).find()).toEqual([
      expect.objectContaining({
        resourceId: 1,
        endTime: null,
        startFlowNodeId: 'observed-operation',
        startFlowRunId: 'failed-flow',
      }),
    ]);
    expect(billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(billing.chargeForResourceUsage).not.toHaveBeenCalled();
    expect(billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
  }
  return {
    get source() {
      return source;
    },
    get usage() {
      return usage;
    },
    get operating() {
      return operating;
    },
    get users() {
      return users;
    },
    get flow() {
      return flow;
    },
    get billing() {
      return billing;
    },
    get maintenance() {
      return maintenance;
    },
    get draftItem() {
      return draftItem;
    },
    get seedActiveSession() {
      return seedActiveSession;
    },
    get publishedState() {
      return publishedState;
    },
    get failAfterObservation() {
      return failAfterObservation;
    },
    get expectObservationAndNoAttempt() {
      return expectObservationAndNoAttempt;
    },
  };
}

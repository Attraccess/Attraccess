import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  FormSubmission,
  Project,
  Resource,
  ResourceFormAction,
  ResourceOperatingInterval,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { DataSource, EntityManager, EntitySchema } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResourceUsageService } from './resourceUsage.service';
import { ResourceOperatingIntervalService } from '../operating-intervals/resource-operating-interval.service';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { closeResourceTransactionConnection } from '../../database/run-serialized-transaction';
import { InsufficientBalanceError } from '../../billing/errors/insufficient-balance.error';

// Real repositories and relations for the lifecycle boundary; peripheral domain tables are omitted.
const schemas = [
  new EntitySchema<Resource>({
    name: 'Resource',
    target: Resource,
    tableName: 'resource',
    columns: {
      id: { type: Number, primary: true },
      name: { type: String },
      type: { type: String },
      allowTakeOver: { type: Boolean, default: true },
      supervisionMode: { type: String },
    },
  }),
  new EntitySchema<User>({
    name: 'User',
    target: User,
    tableName: 'user',
    columns: {
      id: { type: Number, primary: true },
      username: { type: String },
      creditBalance: { type: Number, default: 100 },
    },
  }),
  new EntitySchema<Project>({
    name: 'Project',
    target: Project,
    tableName: 'project',
    columns: {
      id: { type: Number, primary: true },
    },
  }),
  new EntitySchema<ResourceUsage>({
    name: 'ResourceUsage',
    target: ResourceUsage,
    tableName: 'resource_usage',
    columns: {
      id: { type: Number, primary: true, generated: true },
      resourceId: { type: Number },
      userId: { type: Number },
      usageAction: { type: String, default: ResourceUsageAction.Usage },
      startTime: { type: 'datetime' },
      startNotes: { type: String, nullable: true },
      endTime: { type: 'datetime', nullable: true },
      endNotes: { type: String, nullable: true },
      isFinalized: { type: Boolean, default: false },
      lifecyclePending: { type: Boolean, default: false },
      supervisorUserId: { type: Number, nullable: true },
      projectId: { type: Number, nullable: true },
      sessionDurationCreditsPerMinute: { type: Number, nullable: true },
      operatingDurationCreditsPerMinute: { type: Number, nullable: true },
      attributedOperatingDurationInMinutes: { type: Number, nullable: true },
    },
    relations: {
      resource: { type: 'many-to-one', target: 'Resource', joinColumn: { name: 'resourceId' } },
      user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' } },
      supervisorUser: { type: 'many-to-one', target: 'User', joinColumn: { name: 'supervisorUserId' } },
      project: { type: 'many-to-one', target: 'Project', joinColumn: { name: 'projectId' } },
      billingTransaction: { type: 'one-to-one', target: 'BillingTransaction', inverseSide: 'resourceUsage' },
    },
  }),
  new EntitySchema<BillingTransaction>({
    name: 'BillingTransaction',
    target: BillingTransaction,
    tableName: 'billing_transaction',
    columns: {
      id: { type: Number, primary: true, generated: true },
      resourceUsageId: { type: Number },
      userId: { type: Number },
      amount: { type: Number },
      status: { type: String },
    },
    relations: {
      resourceUsage: { type: 'one-to-one', target: 'ResourceUsage', joinColumn: { name: 'resourceUsageId' } },
    },
  }),
  new EntitySchema<BillingTransactionItem>({
    name: 'BillingTransactionItem',
    target: BillingTransactionItem,
    tableName: 'billing_transaction_item',
    columns: {
      id: { type: Number, primary: true, generated: true },
      billingTransactionId: { type: Number },
      name: { type: String },
      description: { type: String, nullable: true },
      externalReference: { type: String, nullable: true },
      unitPrice: { type: Number },
      quantity: { type: Number },
    },
  }),
  new EntitySchema<FormSubmission>({
    name: 'FormSubmission',
    target: FormSubmission,
    tableName: 'form_submission',
    columns: {
      id: { type: Number, primary: true, generated: true },
      formId: { type: Number },
      resourceUsageId: { type: Number },
      userId: { type: Number },
      action: { type: String },
      data: { type: 'simple-json' },
    },
  }),
  new EntitySchema<ResourceUsageLifecycleAttempt>({
    name: 'ResourceUsageLifecycleAttempt',
    target: ResourceUsageLifecycleAttempt,
    tableName: 'resource_usage_lifecycle_attempt',
    columns: {
      id: { type: String, primary: true },
      resourceId: { type: Number },
      kind: { type: String },
      candidateUsageId: { type: Number, nullable: true },
      previousUsageId: { type: Number, nullable: true },
      transitionTime: { type: 'datetime' },
      formSubmissions: { type: 'simple-json' },
      billingItems: { type: 'simple-json' },
      createdAt: { type: 'datetime', createDate: true },
    },
    indices: [{ columns: ['resourceId'], unique: true }],
  }),
  new EntitySchema<ResourceOperatingInterval>({
    name: 'ResourceOperatingInterval',
    target: ResourceOperatingInterval,
    tableName: 'resource_operating_interval',
    columns: {
      id: { type: Number, primary: true, generated: true },
      resourceId: { type: Number },
      startTime: { type: 'datetime' },
      endTime: { type: 'datetime', nullable: true },
      startFlowNodeId: { type: String, nullable: true },
      startFlowRunId: { type: String, nullable: true },
      endFlowNodeId: { type: String, nullable: true },
      endFlowRunId: { type: String, nullable: true },
    },
  }),
];

describe('Usage lifecycle persistence around external flows', () => {
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
        .mockResolvedValue({ creditsPerMinute: 2, creditsPerOperatingMinute: 3 }),
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

  it('aborts a failed start without publishing its candidate, forms, or bill and keeps accepted operation', async () => {
    const before = await publishedState();
    failAfterObservation();

    await expect(usage.startSession(1, users[0], { notes: 'Pending start' })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await publishedState()).toEqual(before);
    await expectObservationAndNoAttempt();
  });

  it('keeps the existing session and charge unchanged after a failed stop while preserving operation', async () => {
    await seedActiveSession();
    const before = await publishedState();
    failAfterObservation();

    await expect(usage.endSession(1, users[0], { notes: 'Pending stop' })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await publishedState()).toEqual(before);
    await expectObservationAndNoAttempt();
  });

  it('keeps the outgoing session intact and removes the candidate after a failed takeover', async () => {
    await seedActiveSession();
    const before = await publishedState();
    failAfterObservation();

    await expect(usage.startSession(1, users[1], { forceTakeOver: true })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await publishedState()).toEqual(before);
    await expectObservationAndNoAttempt();
  });

  it('rejects same-user takeover when the outgoing charge leaves too little balance for replacement', async () => {
    await seedActiveSession();
    await source.getRepository(User).update(users[0].id, { creditBalance: 23 });
    const before = await publishedState();
    const checkedBalances: number[] = [];
    billing.validateResourceUsageStart.mockImplementation(async (_resourceId, session, user, manager) => {
      const storedUser = await manager.findOneByOrFail(User, { id: user.id });
      checkedBalances.push(storedUser.creditBalance);
      if (storedUser.creditBalance < session.sessionDurationCreditsPerMinute) throw new InsufficientBalanceError();
    });
    billing.handleResourceUsageStart.mockImplementation(async (resourceId, session, user, manager) => {
      await billing.validateResourceUsageStart(resourceId, session, user, manager);
      return manager.save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
    });
    flow.runFlow.mockImplementation(async (resourceId, _trigger, payload, _manager, { lifecycleAttemptId }) => {
      await operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'same-user-takeover',
      });
      await usage.stageLifecycleBillingItem(lifecycleAttemptId, resourceId, payload.id, draftItem);
    });

    await expect(usage.startSession(1, users[0], { forceTakeOver: true })).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );

    expect(checkedBalances).toEqual([23, 0]);
    expect(await publishedState()).toEqual(before);
    expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(await source.getRepository(ResourceOperatingInterval).count()).toBe(1);
    expect(billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
    expect(flow.trackResourceActivity).not.toHaveBeenCalled();
  });

  it('does not publish a pending start after its flow has triggered maintenance', async () => {
    maintenance.hasActiveMaintenance.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    flow.runFlow.mockImplementation(async (resourceId) => {
      await operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'maintenance-triggered',
      });
    });

    await expect(usage.startSession(1, users[0], { notes: 'Pending start' })).rejects.toThrow(
      'ResourceMaintenanceInUseException',
    );

    expect(await source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(flow.trackResourceActivity).not.toHaveBeenCalled();
  });

  it('does not publish a tentative start when its flow ends the session', async () => {
    flow.runFlow.mockImplementation(async (_resourceId, _trigger, _payload, _manager, { lifecycleAttemptId }) => {
      await usage.cancelLifecycleCandidate(lifecycleAttemptId, 1);
    });

    await expect(usage.startSession(1, users[0], { notes: 'Ended by flow' })).rejects.toThrow(
      'The tentative usage session was cancelled',
    );

    expect(await source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(flow.trackResourceActivity).not.toHaveBeenCalled();
  });

  it('keeps a canceled candidate reservation until its flow settles', async () => {
    let releaseFlow!: () => void;
    const flowSettled = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    let candidateCancelled!: () => void;
    const cancellationComplete = new Promise<void>((resolve) => {
      candidateCancelled = resolve;
    });
    flow.runFlow.mockImplementation(async (_resourceId, _trigger, _payload, _manager, { lifecycleAttemptId }) => {
      await usage.cancelLifecycleCandidate(lifecycleAttemptId, 1);
      candidateCancelled();
      await flowSettled;
    });

    const firstStart = usage.startSession(1, users[0], { notes: 'Ended by flow' });
    await cancellationComplete;

    await expect(usage.startSession(1, users[1], { notes: 'Competing start' })).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );

    releaseFlow();
    await expect(firstStart).rejects.toThrow('The tentative usage session was cancelled');
    expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
  });

  it('aborts an abandoned takeover at startup without replaying flows or discarding accepted operation', async () => {
    const previous = await seedActiveSession();
    const before = await publishedState();
    const candidate = await source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 2,
      startTime: new Date(),
      endTime: null,
      lifecyclePending: true,
      isFinalized: false,
    });
    await source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'abandoned-attempt',
      resourceId: 1,
      kind: 'takeover',
      previousUsageId: previous.id,
      candidateUsageId: candidate.id,
      transitionTime: candidate.startTime,
      formSubmissions: [
        { formId: 11, resourceUsageId: candidate.id, userId: 2, action: ResourceFormAction.TAKEOVER, data: {} },
      ],
      billingItems: [{ ...draftItem, usageId: previous.id }],
    });
    await operating.transition(1, 'operating', { flowNodeId: 'observed-operation', flowRunId: 'failed-flow' });

    await usage.onModuleInit();

    expect(await publishedState()).toEqual(before);
    expect(flow.runFlow).not.toHaveBeenCalled();
    await expectObservationAndNoAttempt();
  });
});

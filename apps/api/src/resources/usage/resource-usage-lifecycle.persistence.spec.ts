import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  FormSubmission,
  Form,
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
import { recoverOrphanedUsages, USAGE_RECOVERY_TABLE_SQL } from '../../database/resource-usage-integrity';
import { ResourceUsageIntegrity1790100000000 } from '../../database/migrations/1790100000000-resource-usage-integrity';
import { ResourceInUseError } from './errors/resource-in-use.error';

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
      billingFactor: { type: Number, default: 100 },
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
      usageInMinutes: {
        type: Number,
        generatedType: 'STORED',
        insert: false,
        update: false,
        asExpression: `CASE WHEN endTime IS NULL THEN -1 ELSE (julianday(endTime) - julianday(startTime)) * 1440 END`,
      },
      isFinalized: { type: Boolean, default: false },
      lifecyclePending: { type: Boolean, default: false },
      supervisorUserId: { type: Number, nullable: true },
      projectId: { type: Number, nullable: true },
      sessionDurationCreditsPerMinute: { type: Number, nullable: true },
      operatingDurationCreditsPerMinute: { type: Number, nullable: true },
      creditsPerUsage: { type: Number, nullable: true },
      billingFactor: { type: Number, nullable: true },
      attributedOperatingDurationInMinutes: { type: Number, nullable: true },
    },
    relations: {
      resource: { type: 'many-to-one', target: 'Resource', joinColumn: { name: 'resourceId' } },
      user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' } },
      supervisorUser: { type: 'many-to-one', target: 'User', joinColumn: { name: 'supervisorUserId' } },
      project: { type: 'many-to-one', target: 'Project', joinColumn: { name: 'projectId' } },
      billingTransaction: { type: 'one-to-one', target: 'BillingTransaction', inverseSide: 'resourceUsage' },
      formSubmissions: { type: 'one-to-many', target: 'FormSubmission', inverseSide: 'resourceUsage' },
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
    relations: {
      resourceUsage: { type: 'many-to-one', target: 'ResourceUsage', joinColumn: { name: 'resourceUsageId' } },
      form: { type: 'many-to-one', target: 'Form', joinColumn: { name: 'formId' } },
      user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' } },
    },
  }),
  new EntitySchema<Form>({
    name: 'Form',
    target: Form,
    tableName: 'form',
    columns: { id: { type: Number, primary: true }, name: { type: String } },
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
  let events: EventEmitter2;
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
    await source.query(USAGE_RECOVERY_TABLE_SQL);
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
    await source.getRepository(Form).save({ id: 11, name: 'Safety checklist' });
    events = new EventEmitter2();
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

  async function migrateIntegrity() {
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await new ResourceUsageIntegrity1790100000000().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  it.each([false, true])(
    'recovers a legacy orphan on restart without losing forms or changing billing (bill=%s)',
    async (hasBill) => {
      await source.getRepository(Resource).update(1, { allowTakeOver: false });
      const orphan = await source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date('2026-09-23T14:00:40Z'),
        endTime: null,
        isFinalized: false,
        lifecyclePending: false,
        startNotes: 'DEMO: ongoing laboratory run',
        endNotes: 'Original note',
        attributedOperatingDurationInMinutes: 17,
      });
      await source.getRepository(FormSubmission).save({
        formId: 11,
        resourceUsageId: orphan.id,
        userId: 1,
        action: ResourceFormAction.START,
        data: { answer: 'kept' },
      });
      if (hasBill)
        await source.getRepository(BillingTransaction).save({
          resourceUsageId: orphan.id,
          userId: 1,
          amount: 7,
          status: BillingTransactionStatus.Completed,
        });
      const before = await publishedState();
      const emitted = jest.spyOn(events, 'emit');
      expect((await usage.getResourceUsageHistory(1)).data.map((row) => row.id)).toEqual([orphan.id]);
      expect(await usage.getActiveSession(1)).toBeNull();
      expect((await usage.getActiveSessions([1])).get(1)).toBeNull();
      await expect(usage.endSession(1, users[0], {})).rejects.toThrow('No active session found');

      await usage.onModuleInit();
      const after = await publishedState();
      expect(after.sessions).toEqual([
        expect.objectContaining({
          id: orphan.id,
          startTime: orphan.startTime,
          endTime: orphan.startTime,
          startNotes: orphan.startNotes,
          isFinalized: false,
          lifecyclePending: false,
          usageInMinutes: 0,
          attributedOperatingDurationInMinutes: 0,
          endNotes: expect.stringContaining('Original note\n[Recovery: cancelled orphan'),
        }),
      ]);
      expect(after.submissions).toEqual(before.submissions);
      expect(after.transactions).toEqual(before.transactions);
      expect(after.users).toEqual(before.users);
      const journal = await source.query('SELECT * FROM resource_usage_recovery');
      expect(journal).toEqual([
        expect.objectContaining({
          usageId: orphan.id,
          resourceId: 1,
          userId: 1,
          originalEndNotes: 'Original note',
          originalAttributedOperatingDurationInMinutes: 17,
          reason: 'cancelled_orphan_unfinalized_session',
        }),
      ]);
      await usage.recoverInterruptedLifecycles();
      expect(await publishedState()).toEqual(after);
      expect(await source.query('SELECT * FROM resource_usage_recovery')).toEqual(journal);
      expect(emitted).not.toHaveBeenCalled();
      expect(flow.runFlow).not.toHaveBeenCalled();
      expect(billing.chargeForResourceUsage).not.toHaveBeenCalled();
      expect(billing.handleResourceUsageStart).not.toHaveBeenCalled();
      expect(billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
      expect((await usage.getResourceUsageHistory(1)).data[0].formSubmissions).toHaveLength(1);
      const started = await usage.startSession(1, users[1], {});
      expect((await usage.getActiveSession(1))?.id).toBe(started.id);
      expect((await usage.getActiveSessions([1])).get(1)?.id).toBe(started.id);
    },
  );

  it('reconciles legacy orphans before enforcing open-state and occupancy constraints', async () => {
    const orphan = await source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: false,
    });
    await migrateIntegrity();
    expect(await source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
      usageInMinutes: 0,
    });
    await expect(
      source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
      }),
    ).rejects.toThrow('Open usage must be finalized or lifecycle-pending');
    await expect(source.getRepository(ResourceUsage).update(orphan.id, { endTime: null })).rejects.toThrow(
      'Open usage must be finalized or lifecycle-pending',
    );
    const active = await seedActiveSession();
    await expect(seedActiveSession()).rejects.toThrow('Resource already has an active usage session');
    const candidate = await source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 2,
      startTime: new Date(),
      lifecyclePending: true,
      isFinalized: false,
    });
    await expect(
      source.getRepository(ResourceUsage).update(candidate.id, {
        isFinalized: true,
        lifecyclePending: false,
      }),
    ).rejects.toThrow('Resource already has an active usage session');
    await expect(
      source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 2,
        startTime: new Date(),
        lifecyclePending: true,
      }),
    ).rejects.toThrow('UNIQUE constraint');
    await expect(usage.startSession(1, users[1], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );
    await expect(usage.endSession(1, users[0], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );
    expect((await usage.getActiveSession(1))?.id).toBe(active.id);
    expect((await usage.getActiveSessions([1])).get(1)?.id).toBe(active.id);
    await source.getRepository(ResourceUsage).delete(candidate.id);
    await usage.recoverInterruptedLifecycles();
    await expect(usage.startSession(1, users[1], {})).rejects.toBeInstanceOf(ResourceInUseError);
    expect(flow.runFlow).not.toHaveBeenCalled();
    expect(await source.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(await source.query('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('retains duplicate legacy real sessions and resolves them consistently without cancelling or charging them', async () => {
    const first = await seedActiveSession();
    const second = await seedActiveSession();
    const before = await publishedState();
    await migrateIntegrity();
    await usage.recoverInterruptedLifecycles();
    expect(await publishedState()).toEqual(before);
    expect((await usage.getActiveSession(1))?.id).toBe(second.id);
    expect((await usage.getActiveSessions([1])).get(1)?.id).toBe(second.id);
    await expect(seedActiveSession()).rejects.toThrow('Resource already has an active usage session');
    await usage.endSession(1, users[0], {});
    expect((await usage.getActiveSession(1))?.id).toBe(first.id);
    expect((await usage.getActiveSessions([1])).get(1)?.id).toBe(first.id);
    expect(await source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });

  it('keeps valid in-flight start reservations protected and never quarantines them', async () => {
    await migrateIntegrity();
    let enteredFlow!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredFlow = resolve;
    });
    let releaseFlow!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    flow.runFlow.mockImplementation(async () => {
      enteredFlow();
      await released;
    });
    const start = usage.startSession(1, users[0], {});
    await entered;
    try {
      expect(await usage.getActiveSession(1)).toBeNull();
      expect((await usage.getActiveSessions([1])).get(1)).toBeNull();
      expect((await usage.getResourceUsageHistory(1)).total).toBe(0);
      await expect(usage.startSession(1, users[1], { forceTakeOver: true })).rejects.toThrow(
        'A usage lifecycle operation is already in progress',
      );
      await expect(usage.endSession(1, users[0], {})).rejects.toThrow(
        'A usage lifecycle operation is already in progress',
      );
      expect(await source.transaction((manager) => recoverOrphanedUsages(manager))).toBe(0);
      expect(await source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(1);
      expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(1);
    } finally {
      releaseFlow();
    }
    const session = await start;
    expect((await usage.getActiveSession(1))?.id).toBe(session.id);
    expect(flow.runFlow).toHaveBeenCalledTimes(1);
    expect(billing.handleResourceUsageStart).toHaveBeenCalledTimes(1);
    expect(await source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });

  it('never repairs history without its audit journal and retains evidence on downgrade', async () => {
    const orphan = await source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: false,
    });
    await source.query(`CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON resource_usage_recovery
      BEGIN SELECT RAISE(ABORT, 'journal unavailable'); END`);
    await expect(usage.recoverInterruptedLifecycles()).rejects.toThrow('journal unavailable');
    expect(await source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toEqual(orphan);
    await source.query('DROP TRIGGER reject_recovery_audit');
    await migrateIntegrity();
    const journal = await source.query('SELECT * FROM resource_usage_recovery');
    const runner = source.createQueryRunner();
    try {
      await new ResourceUsageIntegrity1790100000000().down(runner);
    } finally {
      await runner.release();
    }
    expect(await source.query('SELECT * FROM resource_usage_recovery')).toEqual(journal);
    expect(await source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
    });
  });

  it.each([false, true])(
    'preserves the complete price contract through a start flow (takeover=%s)',
    async (takeover) => {
      await migrateIntegrity();
      if (takeover) await seedActiveSession();
      const starter = users[1];
      await source.getRepository(User).update(starter.id, { billingFactor: 50 });
      starter.billingFactor = 75; // Request authentication may predate a billing-factor edit.
      flow.runFlow.mockImplementation(async () => {
        await source.getRepository(User).update(starter.id, { billingFactor: 150 });
        billing.getResourceBillingConfiguration.mockResolvedValue({
          creditsPerUsage: 99,
          creditsPerMinute: 99,
          creditsPerOperatingMinute: 99,
        });
      });

      const session = await usage.startSession(1, starter, { forceTakeOver: takeover });

      expect(session).toMatchObject({
        lifecyclePending: false,
        creditsPerUsage: 5,
        billingFactor: 50,
        sessionDurationCreditsPerMinute: 2,
        operatingDurationCreditsPerMinute: 3,
      });
      expect(await source.getRepository(BillingTransaction).findOneBy({ resourceUsageId: session.id })).toMatchObject({
        status: BillingTransactionStatus.Pending,
        amount: 0,
      });
      expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    },
  );

  it('does not start or run physical flows if its price snapshot cannot be persisted', async () => {
    await source.query(`CREATE TRIGGER reject_price_snapshot BEFORE UPDATE OF billingFactor ON resource_usage
      BEGIN SELECT RAISE(ABORT, 'snapshot unavailable'); END`);

    await expect(usage.startSession(1, users[0], {})).rejects.toThrow('snapshot unavailable');

    expect(await source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(flow.runFlow).not.toHaveBeenCalled();
  });

  it('publishes neither the session nor its bill if pending transaction creation fails', async () => {
    billing.handleResourceUsageStart.mockImplementation(async (_resourceId, session, user, manager) => {
      await manager.save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
      throw new Error('pending transaction unavailable');
    });

    await expect(usage.startSession(1, users[0], {})).rejects.toThrow('pending transaction unavailable');

    expect(await source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(flow.trackResourceActivity).not.toHaveBeenCalled();
  });

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
        expect((await usage.getActiveSession(resourceId))?.id ?? null).toBe(attempt.previousUsageId);
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
    await migrateIntegrity();
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
    await migrateIntegrity();
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

  it('claims a candidate before stopped-flow effects so concurrent ends run them once', async () => {
    const candidate = await source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      endTime: null,
      lifecyclePending: true,
      isFinalized: false,
    });
    await source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'candidate-cancellation',
      resourceId: 1,
      kind: 'start',
      previousUsageId: null,
      candidateUsageId: candidate.id,
      transitionTime: candidate.startTime,
      formSubmissions: [],
      billingItems: [],
    });
    let releaseFlow!: () => void;
    const flowSettled = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    let stoppedFlowStarted!: () => void;
    const stoppedFlowStartedPromise = new Promise<void>((resolve) => {
      stoppedFlowStarted = resolve;
    });
    flow.runFlow.mockImplementation(async () => {
      stoppedFlowStarted();
      await flowSettled;
    });

    const firstEnd = usage.endLifecycleCandidate('candidate-cancellation', 1, 'Stopped');
    await stoppedFlowStartedPromise;
    const secondEnd = usage.endLifecycleCandidate('candidate-cancellation', 1, 'Stopped');

    await expect(secondEnd).rejects.toThrow('The usage lifecycle attempt has no candidate session');
    expect(flow.runFlow).toHaveBeenCalledTimes(1);
    expect(await source.getRepository(ResourceUsage).findOneBy({ id: candidate.id })).toBeNull();
    await expect(
      source.getRepository(ResourceUsageLifecycleAttempt).findOneByOrFail({ id: 'candidate-cancellation' }),
    ).resolves.toMatchObject({ candidateUsageId: null });

    releaseFlow();
    await expect(firstEnd).resolves.toBeUndefined();
  });

  it('aborts an abandoned takeover at startup without replaying flows or discarding accepted operation', async () => {
    await migrateIntegrity();
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
    await usage.recoverInterruptedLifecycles();
    expect(await publishedState()).toEqual(before);
    expect(await source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });
});

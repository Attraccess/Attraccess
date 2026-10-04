import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, Logger } from '@nestjs/common';
import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceOperatingInterval,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  SupervisionMode,
  User,
  FormSubmission,
  Project,
} from '@attraccess/database-entities';
import { DataSource, EntityManager, EntitySchema } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { closeResourceTransactionConnection } from '../../database/run-serialized-transaction';
import { MeteringReport } from '../flows/node-executors';
import { ResourceMeteringService } from './resource-metering.service';

const T = ResourceFlowNodeType;

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
    columns: { id: { type: Number, primary: true } },
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
      creditsPerUsage: { type: Number, nullable: true },
      energyCreditsPerKwh: { type: Number, nullable: true },
      billingFactor: { type: Number, nullable: true },
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
      resourceUsageId: { type: Number, nullable: true },
      userId: { type: Number },
      initiatorId: { type: Number, nullable: true },
      correctionOfId: { type: Number, nullable: true },
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
      energyMicroWh: { type: String, nullable: true },
      energyCreditsPerKwh: { type: Number, nullable: true },
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
  new EntitySchema<ResourceFlowNode>({
    name: 'ResourceFlowNode',
    target: ResourceFlowNode,
    tableName: 'resource_flow_node',
    columns: {
      id: { type: String, primary: true },
      type: { type: String },
      resourceId: { type: Number },
      data: { type: 'simple-json', nullable: true },
    },
  }),
  new EntitySchema<ResourceFlowEdge>({
    name: 'ResourceFlowEdge',
    target: ResourceFlowEdge,
    tableName: 'resource_flow_edge',
    columns: {
      id: { type: String, primary: true },
      source: { type: String },
      sourceHandle: { type: String, nullable: true },
      target: { type: String },
      targetHandle: { type: String, nullable: true },
      resourceId: { type: Number },
    },
  }),
  new EntitySchema<ResourceMeteringSession>({
    name: 'ResourceMeteringSession',
    target: ResourceMeteringSession,
    tableName: 'resource_metering_session',
    columns: {
      id: { type: String, primary: true },
      resourceId: { type: Number },
      usageId: { type: Number },
      status: { type: String },
      creditsPerKwh: { type: Number },
      baselineMicroWh: { type: String, nullable: true },
      source: { type: String, nullable: true },
      latestMicroWh: { type: String, nullable: true },
      latestObservedAt: { type: 'datetime', nullable: true },
      consumedMicroWh: { type: String, nullable: true },
      chargeCredits: { type: Number, nullable: true },
      finalOperationId: { type: String, nullable: true },
      failureReason: { type: 'text', nullable: true },
      compromisedReason: { type: 'text', nullable: true },
      settledAt: { type: 'datetime', nullable: true },
      createdAt: { type: 'datetime', createDate: true },
      updatedAt: { type: 'datetime', updateDate: true },
    },
    indices: [{ columns: ['usageId'], unique: true }],
  }),
  new EntitySchema<ResourceMeteringOperation>({
    name: 'ResourceMeteringOperation',
    target: ResourceMeteringOperation,
    tableName: 'resource_metering_operation',
    columns: {
      id: { type: String, primary: true },
      sessionId: { type: String },
      resourceId: { type: Number },
      kind: { type: String },
      status: { type: String },
      requestedAt: { type: 'datetime' },
      completedAt: { type: 'datetime', nullable: true },
      totalMicroWh: { type: String, nullable: true },
      observedAt: { type: 'datetime', nullable: true },
      source: { type: String, nullable: true },
      error: { type: 'text', nullable: true },
      createdAt: { type: 'datetime', createDate: true },
    },
  }),
];

type Handler = (options: { complete: (report: MeteringReport) => Promise<void>; kind: string }) => Promise<void>;

describe('Flow-defined energy metering', () => {
  let directory: string;
  let source: DataSource;
  let metering: ResourceMeteringService;
  let usage: ResourceUsageService;
  let users: User[];
  let log: string[];
  /** What the simulated meter does when its branches run; tests replace these. */
  let onStart: Handler;
  let onCollect: Handler;
  let startEffects: () => Promise<void>;
  let flows: { runFlow: jest.Mock; trackResourceActivity: jest.Mock };
  let configRate: number;
  let audit: { recordBillingTransactionAfterCommit: jest.Mock; recordResource: jest.Mock };
  let liveNotifications: { notifyTransactionUpdate: jest.Mock };

  const reading =
    (value: string, unit = 'kWh', extra: Partial<Extract<MeteringReport, { kind: 'reading' }>> = {}): Handler =>
    ({ complete }) =>
      complete({ kind: 'reading', value, unit, ...extra });

  const ready: Handler = ({ complete }) => complete({ kind: 'ready' });

  async function seedMeter(startData: object = {}, collectData: object = { finalRetryDelaySeconds: 0 }) {
    const nodes = source.getRepository(ResourceFlowNode);
    await nodes.save([
      { id: 'start', type: T.INPUT_METERING_START, resourceId: 1, data: startData },
      { id: 'ready', type: T.OUTPUT_METERING_READY, resourceId: 1, data: {} },
      { id: 'collect', type: T.INPUT_METERING_COLLECT, resourceId: 1, data: collectData },
      { id: 'report', type: T.OUTPUT_METERING_REPORT, resourceId: 1, data: { value: '1', unit: 'kWh' } },
    ]);
    await source.getRepository(ResourceFlowEdge).save([
      { id: 'e1', source: 'start', sourceHandle: 'output', target: 'ready', targetHandle: 'input', resourceId: 1 },
      { id: 'e2', source: 'collect', sourceHandle: 'output', target: 'report', targetHandle: 'input', resourceId: 1 },
    ]);
  }

  async function items(usageId: number) {
    const transaction = await source.getRepository(BillingTransaction).findOneByOrFail({ resourceUsageId: usageId });
    return {
      transaction,
      items: await source
        .getRepository(BillingTransactionItem)
        .find({ where: { billingTransactionId: transaction.id } }),
    };
  }

  const correctionsOf = async (usageId: number) => {
    const original = await source.getRepository(BillingTransaction).findOneByOrFail({ resourceUsageId: usageId });
    const corrections = await source.getRepository(BillingTransaction).find({ where: { correctionOfId: original.id } });
    const rows = await source.getRepository(BillingTransactionItem).find({
      where: corrections.map((correction) => ({ billingTransactionId: correction.id })),
    });
    return { original, corrections, items: rows };
  };

  const sessionOf = (usageId: number) => source.getRepository(ResourceMeteringSession).findOneByOrFail({ usageId });

  beforeEach(async () => {
    for (const method of ['debug', 'log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
    }
    directory = await mkdtemp(join(tmpdir(), 'attraccess-metering-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'test.sqlite'),
      synchronize: true,
      entities: schemas,
    }).initialize();
    await source.getRepository(Resource).save({
      id: 1,
      name: 'Laser',
      type: ResourceType.Machine,
      allowTakeOver: true,
      supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    });
    users = await source.getRepository(User).save([
      { id: 1, username: 'owner' },
      { id: 2, username: 'next-user' },
    ]);
    users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(['resources.update']) }));

    log = [];
    configRate = 30;
    onStart = ready;
    onCollect = reading('1.5');
    startEffects = async () => undefined;
    flows = {
      trackResourceActivity: jest.fn(),
      runFlow: jest.fn(
        async (
          _resourceId: number,
          type: ResourceFlowNodeType,
          _payload: object,
          _manager: unknown,
          options: { metering: { kind: string; complete: (report: MeteringReport) => Promise<void> } },
        ) => {
          if (type === T.INPUT_METERING_START) {
            log.push('meter:start');
            await onStart(options.metering);
          } else if (type === T.INPUT_METERING_COLLECT) {
            log.push(`meter:${options.metering.kind}`);
            await onCollect(options.metering);
          } else {
            log.push(`flow:${type}`);
            if (type === T.INPUT_RESOURCE_USAGE_STARTED || type === T.INPUT_RESOURCE_USAGE_TAKEOVER) {
              await startEffects();
            }
          }
          return [];
        },
      ),
    };
    audit = { recordBillingTransactionAfterCommit: jest.fn(), recordResource: jest.fn() };
    liveNotifications = { notifyTransactionUpdate: jest.fn().mockResolvedValue(undefined) };
    metering = new ResourceMeteringService(
      source.getRepository(ResourceMeteringSession),
      source.getRepository(ResourceMeteringOperation),
      source.getRepository(ResourceFlowNode),
      source.getRepository(ResourceFlowEdge),
      flows as never,
      audit as never,
      liveNotifications as never,
    );
    const billing = {
      getResourceBillingConfiguration: jest.fn(async () => ({
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
        creditsPerKwh: configRate,
      })),
      validateResourceUsageStart: jest.fn().mockResolvedValue(undefined),
      handleResourceUsageStart: jest.fn(
        async (_id: number, session: ResourceUsage, user: User, manager: EntityManager) =>
          manager.save(BillingTransaction, {
            resourceUsageId: session.id,
            userId: user.id,
            amount: 0,
            status: BillingTransactionStatus.Pending,
          }),
      ),
      // The real charge sums the items already on the transaction; that is all these tests need from it.
      chargeForResourceUsage: jest.fn(async (session: ResourceUsage, manager: EntityManager) => {
        log.push('charge');
        const transaction = await manager.findOneByOrFail(BillingTransaction, { resourceUsageId: session.id });
        const rows = await manager.find(BillingTransactionItem, { where: { billingTransactionId: transaction.id } });
        const total = rows.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        await manager.update(BillingTransaction, transaction.id, {
          amount: -total,
          status: BillingTransactionStatus.Completed,
        });
        return transaction;
      }),
      notifyResourceUsageCharge: jest.fn().mockResolvedValue(undefined),
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
      {
        hasActiveMaintenance: jest.fn().mockResolvedValue(false),
        canManageMaintenance: jest.fn().mockResolvedValue(false),
      } as never,
      new EventEmitter2(),
      billing as never,
      new ResourceOperatingAttributionService(
        source.getRepository(ResourceOperatingInterval),
        source.getRepository(ResourceUsage),
      ),
      flows as never,
      {} as never,
      { prepareRequiredSubmissions: jest.fn().mockResolvedValue([]) } as never,
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
      metering,
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

  describe('meter definition', () => {
    it('is configured only when each trigger reaches its completion node', async () => {
      expect(await metering.getDefinition(1)).toEqual(
        expect.objectContaining({ configured: false, problems: ['start-trigger-missing', 'collect-trigger-missing'] }),
      );
      await seedMeter();
      expect(await metering.getDefinition(1)).toEqual(expect.objectContaining({ configured: true, problems: [] }));
      await source.getRepository(ResourceFlowEdge).delete({ id: 'e1' });
      await source.getRepository(ResourceFlowEdge).delete({ id: 'e2' });
      expect((await metering.getDefinition(1)).problems).toEqual(['ready-unreachable', 'report-unreachable']);
    });

    it('applies the documented defaults to trigger settings', async () => {
      await seedMeter({}, {});
      const { start, collect } = await metering.getDefinition(1);
      expect(start.timeoutSeconds).toBe(30);
      expect(collect).toEqual({
        timeoutSeconds: 30,
        interimIntervalMinutes: 1,
        finalAttempts: 3,
        finalRetryDelaySeconds: 5,
      });
    });
  });

  describe('usage lifecycle', () => {
    async function start(user = users[0], dto: { forceTakeOver?: boolean } = {}) {
      return usage.startSession(1, user, dto as never);
    }
    const end = (user = users[0]) => usage.endSession(1, user, {} as never);

    it('bills exactly 0.45 for 1.5 kWh at 0.30/kWh without touching the start/stop flows', async () => {
      await seedMeter();
      const session = await start();
      onCollect = reading('1.5');
      const ended = await end();

      expect(session.energyCreditsPerKwh).toBe(30);
      const { transaction, items: rows } = await items(ended.id);
      expect(transaction).toEqual(expect.objectContaining({ amount: -45, status: BillingTransactionStatus.Completed }));
      const energy = rows.find((item) => item.name === 'ENERGY');
      expect(energy).toEqual(
        expect.objectContaining({
          unitPrice: 45,
          quantity: 1,
          energyMicroWh: '1500000000',
          energyCreditsPerKwh: 30,
          externalReference: expect.stringMatching(/^metering:.+:.+$/),
        }),
      );
      expect(await sessionOf(ended.id)).toEqual(
        expect.objectContaining({
          status: ResourceMeteringSessionStatus.Settled,
          chargeCredits: 45,
          consumedMicroWh: '1500000000',
        }),
      );
    });

    it('initializes the meter before any start effect and collects only after the stop flow, before the charge', async () => {
      await seedMeter();
      await start();
      await end();
      expect(log).toEqual([
        'meter:start',
        `flow:${T.INPUT_RESOURCE_USAGE_STARTED}`,
        `flow:${T.INPUT_RESOURCE_USAGE_STOPPED}`,
        'meter:final',
        'charge',
      ]);
    });

    it('does not start an unmetered billed session when the meter is not configured', async () => {
      await expect(start()).rejects.toThrow(expect.objectContaining({ message: 'METER_NOT_CONFIGURED' }));
      expect(log).toEqual([]);
      expect(await source.getRepository(ResourceUsage).count()).toBe(0);
    });

    it.each([
      [
        'fails',
        async () => {
          throw new Error('modbus offline');
        },
      ],
      ['finishes without acknowledging', async () => undefined],
    ])('does not run start effects or leave a session when initialization %s', async (_name, handler) => {
      await seedMeter();
      onStart = handler as Handler;
      await expect(start()).rejects.toBeInstanceOf(BadRequestException);
      expect(log).toEqual(['meter:start']);
      expect(await source.getRepository(ResourceUsage).count()).toBe(0);
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('times out an initialization that never answers', async () => {
      await seedMeter({ timeoutSeconds: 1 });
      onStart = () => new Promise(() => undefined);
      await expect(start()).rejects.toThrow(
        expect.objectContaining({ message: expect.stringMatching(/^METER_INITIALIZATION_FAILED/) }),
      );
      expect(await source.getRepository(ResourceUsage).count()).toBe(0);
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
    }, 10_000);

    it('removes the metering session of a start whose flow effects fail', async () => {
      await seedMeter();
      // Ordinary flow errors are logged and swallowed by the usage service; an external-effect failure aborts.
      const { ExternalEffectFailureError } = await import('../flows/errors/external-effect-failure.error');
      startEffects = async () => {
        throw new ExternalEffectFailureError('relay refused', new Error('cause'));
      };
      await expect(start()).rejects.toBeInstanceOf(ExternalEffectFailureError);
      expect(await source.getRepository(ResourceUsage).count()).toBe(0);
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('removes the session of an interrupted start during restart recovery', async () => {
      await seedMeter();
      const candidate = await source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
        isFinalized: false,
        lifecyclePending: true,
      });
      await source.getRepository(ResourceUsageLifecycleAttempt).save({
        id: 'attempt',
        resourceId: 1,
        kind: 'start',
        candidateUsageId: candidate.id,
        previousUsageId: null,
        transitionTime: new Date(),
        formSubmissions: [],
        billingItems: [],
      });
      await source.getRepository(ResourceMeteringSession).save({
        id: 's1',
        resourceId: 1,
        usageId: candidate.id,
        status: ResourceMeteringSessionStatus.Active,
        creditsPerKwh: 30,
      });
      await usage.recoverInterruptedLifecycles();
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('does not meter resources without an energy rate', async () => {
      configRate = 0;
      await start();
      await end();
      expect(log).not.toContain('meter:start');
      expect(log).not.toContain('meter:final');
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('ends the usage and its stop effects even when the final reading is unavailable, leaving energy pending', async () => {
      await seedMeter({}, { finalAttempts: 2, finalRetryDelaySeconds: 0 });
      await start();
      onCollect = async () => {
        throw new Error('meter unreachable');
      };
      const ended = await end();

      expect(ended.endTime).not.toBeNull();
      expect(log.filter((entry) => entry === 'meter:final')).toHaveLength(2);
      const { transaction, items: rows } = await items(ended.id);
      expect(transaction.status).toBe(BillingTransactionStatus.Completed);
      expect(rows.some((item) => item.name === 'ENERGY')).toBe(false);
      expect(await sessionOf(ended.id)).toEqual(
        expect.objectContaining({ status: ResourceMeteringSessionStatus.Pending, failureReason: 'meter unreachable' }),
      );
      expect((await metering.getStatus(1)).unsettled).toEqual([
        expect.objectContaining({ status: 'pending', retryable: true, reason: 'meter unreachable' }),
      ]);
    });

    it('settles a verified zero consumption as a zero charge instead of treating it as missing', async () => {
      await seedMeter();
      await start();
      onCollect = reading('0');
      const ended = await end();
      const { items: rows } = await items(ended.id);
      expect(rows.find((item) => item.name === 'ENERGY')).toEqual(
        expect.objectContaining({ unitPrice: 0, energyMicroWh: '0' }),
      );
      expect((await sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
    });

    it.each([
      ['a non-numeric reading', reading('n/a')],
      ['an empty reading', reading('')],
      ['a power sample', reading('2.4', 'kW')],
      ['an unknown unit', reading('2', 'bananas')],
      ['a negative reading', reading('-1')],
      ['a stale sample from before the stop', reading('1.5', 'kWh', { observedAt: '2020-01-01T00:00:00Z' })],
      ['a sample from the future', reading('1.5', 'kWh', { observedAt: '2999-01-01T00:00:00Z' })],
    ])('never turns %s into a zero charge', async (_name, handler) => {
      await seedMeter({}, { finalAttempts: 1 });
      await start();
      onCollect = handler;
      const ended = await end();
      const { transaction, items: rows } = await items(ended.id);
      expect(rows.some((item) => item.name === 'ENERGY')).toBe(false);
      expect(transaction.amount).toBe(0);
      expect((await sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
    });

    it('rejects a counter that moved backwards within the session', async () => {
      await seedMeter({}, { finalAttempts: 1 });
      await start();
      const session = await source.getRepository(ResourceMeteringSession).findOneByOrFail({ resourceId: 1 });
      onCollect = reading('2.0');
      await metering['runOperation'](session, 'interim', { trigger: T.INPUT_METERING_COLLECT, timeoutSeconds: 5 });
      onCollect = reading('1.0');
      const ended = await end();
      expect((await sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
      expect((await sessionOf(ended.id)).failureReason).toMatch(/lower than an earlier reading/);
    });

    it('counts a lifetime counter from its baseline and never mixes it with earlier consumption', async () => {
      await seedMeter();
      onStart = ({ complete }) =>
        complete({ kind: 'ready', baseline: { value: '1000', unit: 'kWh' }, source: 'grid-meter' });
      await start();
      expect(
        (await source.getRepository(ResourceMeteringSession).findOneByOrFail({ resourceId: 1 })).baselineMicroWh,
      ).toBe('1000000000000');
      onCollect = reading('1001.5', 'kWh', { source: 'grid-meter' });
      const ended = await end();
      const { transaction } = await items(ended.id);
      expect(transaction.amount).toBe(-45);
      expect((await sessionOf(ended.id)).consumedMicroWh).toBe('1500000000');
    });

    it('rejects a lifetime counter that dropped below its baseline', async () => {
      await seedMeter({}, { finalAttempts: 1 });
      onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '1000', unit: 'kWh' } });
      await start();
      onCollect = reading('12', 'kWh');
      const ended = await end();
      expect((await sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
      expect((await sessionOf(ended.id)).failureReason).toMatch(/below the baseline/);
    });

    it('freezes the rate at session start so later rate changes do not alter the bill', async () => {
      await seedMeter();
      await start();
      configRate = 90;
      onCollect = reading('1.5');
      const ended = await end();
      expect((await items(ended.id)).transaction.amount).toBe(-45);
    });

    it('charges the same total once however many interim readings and repeated stops happened', async () => {
      await seedMeter();
      const first = await start();
      const session = await source.getRepository(ResourceMeteringSession).findOneByOrFail({ usageId: first.id });
      for (const total of ['0.5', '1.0', '1.0', '1.4']) {
        onCollect = reading(total);
        await metering['runOperation'](session, 'interim', { trigger: T.INPUT_METERING_COLLECT, timeoutSeconds: 5 });
      }
      onCollect = reading('1.5');
      const ended = await end();
      expect((await items(ended.id)).items.filter((item) => item.name === 'ENERGY')).toHaveLength(1);
      // A second stop finds no active session and cannot add the energy again.
      await expect(end()).rejects.toBeInstanceOf(BadRequestException);
      expect((await items(ended.id)).transaction.amount).toBe(-45);
      // Settling again inside another transaction is a no-op.
      const finalOperation = await source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'final' });
      await source.transaction((manager) =>
        metering.settleInTransaction(manager, ended.id, { status: 'ready', operationId: finalOperation.id }),
      );
      expect((await items(ended.id)).items.filter((item) => item.name === 'ENERGY')).toHaveLength(1);
    });

    describe('takeover', () => {
      it('reads the outgoing total before re-initializing the meter for the next session and bills both', async () => {
        await seedMeter();
        const first = await start(users[0]);
        onCollect = reading('2.0');
        const second = await start(users[1], { forceTakeOver: true });

        expect(log.slice(-4)).toEqual([
          'meter:final',
          'meter:start',
          `flow:${T.INPUT_RESOURCE_USAGE_TAKEOVER}`,
          'charge',
        ]);
        const outgoing = await items(first.id);
        expect(outgoing.transaction.amount).toBe(-60);
        expect((await sessionOf(first.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
        expect((await sessionOf(second.id)).status).toBe(ResourceMeteringSessionStatus.Active);
        expect((await sessionOf(first.id)).compromisedReason).toBeNull();

        onCollect = reading('0.5');
        const ended = await end(users[1]);
        expect((await items(ended.id)).transaction.amount).toBe(-15);
      });

      it('keeps the outgoing session but refuses to bill its unreliable total when the new meter start fails', async () => {
        await seedMeter({}, { finalAttempts: 1 });
        const first = await start(users[0]);
        onStart = async () => {
          throw new Error('meter did not answer');
        };
        await expect(start(users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(BadRequestException);
        expect((await usage.getActiveSession(1))?.id).toBe(first.id);
        expect((await sessionOf(first.id)).compromisedReason).toMatch(/re-initialized by a takeover/);

        onStart = ready;
        const ended = await end(users[0]);
        expect(await sessionOf(ended.id)).toEqual(
          expect.objectContaining({
            status: ResourceMeteringSessionStatus.Failed,
            failureReason: expect.stringMatching(/re-initialized by a takeover/),
          }),
        );
        expect((await metering.getStatus(1)).unsettled).toEqual([expect.objectContaining({ retryable: false })]);
        expect((await items(ended.id)).items.some((item) => item.name === 'ENERGY')).toBe(false);
      });

      it('marks the outgoing energy failed, not retryable, when its final reading is missing and the next session took the meter', async () => {
        await seedMeter({}, { finalAttempts: 1 });
        const first = await start(users[0]);
        onCollect = async () => {
          throw new Error('meter unreachable');
        };
        await start(users[1], { forceTakeOver: true });
        expect(await sessionOf(first.id)).toEqual(
          expect.objectContaining({ status: ResourceMeteringSessionStatus.Failed }),
        );
        await expect(metering.retrySettlement(1, (await sessionOf(first.id)).id, 1)).rejects.toThrow(
          expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
        );
      });
    });

    describe('reconciliation', () => {
      async function endWithMissingFinal() {
        await seedMeter({}, { finalAttempts: 1 });
        await start();
        onCollect = async () => {
          throw new Error('meter unreachable');
        };
        const ended = await end();
        onCollect = reading('1.5');
        return ended;
      }

      it('retrying bills the pending energy as a separate correction exactly once and leaves the bill untouched', async () => {
        const ended = await endWithMissingFinal();
        const session = await sessionOf(ended.id);
        const before = await items(ended.id);

        await metering.retrySettlement(1, session.id, 1);
        expect(await items(ended.id)).toEqual(before);
        const { original, corrections, items: correctionItems } = await correctionsOf(ended.id);
        expect(corrections).toEqual([
          expect.objectContaining({ amount: -45, status: 'completed', initiatorId: 1, resourceUsageId: null }),
        ]);
        expect(corrections[0].userId).toBe(original.userId);
        expect(audit.recordBillingTransactionAfterCommit).toHaveBeenCalledTimes(1);
        expect(audit.recordBillingTransactionAfterCommit).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: corrections[0].id,
            userId: original.userId,
            initiatorId: 1,
            amount: -45,
            source: 'energy-correction',
          }),
          expect.anything(),
        );
        expect(liveNotifications.notifyTransactionUpdate).toHaveBeenCalledWith(corrections[0].id);
        expect(correctionItems.filter((item) => item.name === 'ENERGY')).toHaveLength(1);
        expect(await sessionOf(ended.id)).toEqual(expect.objectContaining({ status: 'settled', chargeCredits: 45 }));
        await expect(metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
          expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
        );
        expect((await correctionsOf(ended.id)).corrections).toHaveLength(1);
      });

      it('applies the usage billing factor to a late energy charge like every other item', async () => {
        const ended = await endWithMissingFinal();
        await source.getRepository(ResourceUsage).update(ended.id, { billingFactor: 50 });
        await metering.retrySettlement(1, (await sessionOf(ended.id)).id, 1);
        const { corrections, items: rows } = await correctionsOf(ended.id);
        // 45 credits of energy, half price: round(45 - 22.5) = 23 discount, 22 charged.
        expect(corrections[0].amount).toBe(-22);
        expect(rows.find((item) => item.name === 'BILLING_FACTOR')?.unitPrice).toBe(-23);
      });

      it('keeps the charge pending with the reason when the retry is stale or invalid', async () => {
        const ended = await endWithMissingFinal();
        onCollect = reading('1.5', 'kWh', { observedAt: '2020-01-01T00:00:00Z' });
        await expect(metering.retrySettlement(1, (await sessionOf(ended.id)).id, 1)).rejects.toThrow(
          expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }),
        );
        expect(await sessionOf(ended.id)).toEqual(
          expect.objectContaining({ status: 'pending', failureReason: expect.stringMatching(/observed at/) }),
        );
        expect((await items(ended.id)).transaction.amount).toBe(0);
        expect((await correctionsOf(ended.id)).corrections).toEqual([]);
        expect(audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
        expect(liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
      });

      it('refuses to reconcile after a later session started on the meter, and can be waived', async () => {
        const ended = await endWithMissingFinal();
        await start(users[1]);
        const session = await sessionOf(ended.id);
        // Starting the next session already failed the older pending energy.
        expect(session.status).toBe(ResourceMeteringSessionStatus.Failed);
        await source
          .getRepository(ResourceMeteringSession)
          .update(session.id, { status: ResourceMeteringSessionStatus.Pending });
        await expect(metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
          expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }),
        );
        expect((await metering.waive(1, session.id, 7)).status).toBe(ResourceMeteringSessionStatus.Waived);
        expect(audit.recordResource).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'energy_charge.waived', actorId: 7, subjectId: 1 }),
        );
        await expect(metering.waive(1, session.id, 7)).rejects.toThrow(
          expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
        );
      });
    });
  });

  describe('operations', () => {
    async function activeSession() {
      await seedMeter();
      const started = await usage.startSession(1, users[0], {} as never);
      return source.getRepository(ResourceMeteringSession).findOneByOrFail({ usageId: started.id });
    }
    const run = (session: ResourceMeteringSession, kind: 'interim' | 'final' = 'interim', timeoutSeconds = 5) =>
      metering['runOperation'](session, kind, {
        trigger: T.INPUT_METERING_COLLECT,
        timeoutSeconds,
        ...(kind === 'final' ? { freshAfter: new Date(Date.now() - 1000) } : {}),
      });

    it('converts every supported energy unit centrally', async () => {
      const session = await activeSession();
      for (const [value, unit] of [
        ['1500', 'Wh'],
        ['5400', 'kJ'],
        ['0.0015', 'MWh'],
        ['1500000', 'milliwatt-hour'],
      ]) {
        onCollect = reading(value, unit);
        expect((await run(session)).totalMicroWh).toBe('1500000000');
        await source.getRepository(ResourceMeteringSession).update(session.id, { latestMicroWh: null });
      }
    });

    it('rejects a reply that arrives after the operation timed out', async () => {
      const session = await activeSession();
      let lateReply: Promise<void> | undefined;
      onCollect = ({ complete }) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            lateReply = complete({ kind: 'reading', value: '9', unit: 'kWh' });
            lateReply.then(resolve, resolve);
          }, 1300);
        });
      await expect(run(session, 'interim', 1)).rejects.toThrow(/did not reply within 1s/);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await expect(lateReply).rejects.toThrow(/already answered or has expired/);
      const operation = await source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' });
      expect(operation).toEqual(expect.objectContaining({ status: 'expired', totalMicroWh: null }));
      expect(
        (await source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: session.id })).latestMicroWh,
      ).toBeNull();
    }, 10_000);

    it('accepts an identical duplicate reply and rejects a conflicting one', async () => {
      const session = await activeSession();
      onCollect = async ({ complete }) => {
        await complete({ kind: 'reading', value: '1', unit: 'kWh' });
        await complete({ kind: 'reading', value: '1000', unit: 'Wh' });
      };
      expect((await run(session)).totalMicroWh).toBe('1000000000');

      onCollect = async ({ complete }) => {
        await complete({ kind: 'reading', value: '1.2', unit: 'kWh' });
        await complete({ kind: 'reading', value: '1.3', unit: 'kWh' });
      };
      await expect(run(session)).rejects.toThrow(/already answered/);
    });

    it('rejects a reply of the wrong kind and a completion outside a metering run', async () => {
      const session = await activeSession();
      onCollect = ({ complete }) => complete({ kind: 'ready' });
      await expect(run(session)).rejects.toThrow(/does not answer/);

      const { MeteringReportExecutor } = await import('../flows/node-executors');
      await expect(
        new MeteringReportExecutor().execute({ data: { value: '1', unit: 'kWh' } } as never, {}, {
          compileTemplate: (t: string) => t,
        } as never),
      ).rejects.toThrow(/Metering collection/);
    });

    it('fails an operation whose branch ends without reporting', async () => {
      const session = await activeSession();
      onCollect = async () => undefined;
      await expect(run(session)).rejects.toThrow(/finished without reporting/);
      expect(await source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' })).toEqual(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('serializes concurrent requests for one resource so replies cannot cross', async () => {
      const session = await activeSession();
      let running = 0;
      let peak = 0;
      onCollect = async ({ complete, kind }) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 30));
        await complete({ kind: 'reading', value: kind === 'final' ? '2' : '1', unit: 'kWh' });
        running--;
      };
      const [interim, final] = await Promise.all([run(session, 'interim'), run(session, 'final')]);
      expect(peak).toBe(1);
      expect([interim.totalMicroWh, final.totalMicroWh]).toEqual(['1000000000', '2000000000']);
    });

    it('marks operations interrupted by a restart as expired', async () => {
      const session = await activeSession();
      await source.getRepository(ResourceMeteringOperation).save({
        id: 'stuck',
        sessionId: session.id,
        resourceId: 1,
        kind: 'interim',
        status: 'pending',
        requestedAt: new Date(),
      });
      await metering.onModuleInit();
      expect(await source.getRepository(ResourceMeteringOperation).findOneByOrFail({ id: 'stuck' })).toEqual(
        expect.objectContaining({ status: 'expired' }),
      );
    });

    it("exposes the running session's live total and its exactly rounded energy cost", async () => {
      const session = await activeSession();
      expect((await metering.getLive(1)).session).toEqual(
        expect.objectContaining({ latestKwh: null, energyCredits: null, creditsPerKwh: 30 }),
      );
      onCollect = reading('0.05');
      await run(session);
      expect((await metering.getLive(1)).session).toEqual(
        expect.objectContaining({ sessionId: session.id, latestKwh: '0.05', energyCredits: 2, creditsPerKwh: 30 }),
      );
      await usage.endSession(1, users[0], {} as never);
      expect((await metering.getLive(1)).session).toBeNull();
    });

    it('records interim readings for display only and skips busy or disabled meters', async () => {
      const session = await activeSession();
      await source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
      onCollect = reading('0.7');
      await metering.collectInterimReadings();
      expect((await metering.getStatus(1)).activeSession).toEqual(expect.objectContaining({ latestKwh: '0.7' }));

      await source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      await source.getRepository(ResourceFlowNode).update({ id: 'collect' }, { data: { interimIntervalMinutes: 0 } });
      onCollect = reading('0.9');
      await metering.collectInterimReadings();
      expect((await metering.getStatus(1)).activeSession).toEqual(expect.objectContaining({ latestKwh: '0.7' }));
    });

    it('does not poll a meter that keeps failing more often than its interval', async () => {
      const session = await activeSession();
      await source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
      const collect = jest.fn().mockRejectedValue(new Error('meter unreachable'));
      onCollect = collect;
      await metering.collectInterimReadings();
      await metering.collectInterimReadings();
      expect(collect).toHaveBeenCalledTimes(1);
    });
  });
});

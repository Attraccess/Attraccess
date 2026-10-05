import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, Logger } from '@nestjs/common';
import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  Resource,
  ResourceMeter,
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
import { MeteringReadyExecutor, MeteringReportExecutor } from '../flows/node-executors';
import { compileFlowTemplate } from '../flows/flow-template';
import { MeterFlowConversions1790300000000 } from '../../database/migrations/1790300000000-meter-flow-conversions';
import { ResourceMeteringService } from './resource-metering.service';
import { EmailService } from '../../email/email.service';
import { readDefaultTemplateBody, SHIPPED_TRANSLATIONS } from '../../email-template/email-defaults';
import { EmailTemplateType } from '@attraccess/database-entities';
import Handlebars from 'handlebars';

const T = ResourceFlowNodeType;

const schemas = [
  new EntitySchema<ResourceMeter>({
    name: 'ResourceMeter',
    target: ResourceMeter,
    tableName: 'resource_meter',
    columns: {
      id: { type: Number, primary: true, generated: true },
      resourceId: { type: Number },
      name: { type: String },
      creditsPerUnit: { type: Number, default: 30 },
      lifetimeValue: { type: String, default: '0' },
      counterValue: { type: String, nullable: true },
      latestObservedAt: { type: 'datetime', nullable: true },
    },
  }),
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
      meterRates: { type: 'simple-json', nullable: true },
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
      meterQuantity: { type: String, nullable: true },
      meterCreditsPerUnit: { type: Number, nullable: true },
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
      creditsPerUnit: { type: Number },
      collectionMode: { type: String, default: 'requested' },
      meterId: { type: Number, default: 1 },
      meterName: { type: String, default: 'Energy (kWh)' },
      baselineValue: { type: String, nullable: true },
      source: { type: String, nullable: true },
      latestValue: { type: String, nullable: true },
      latestObservedAt: { type: 'datetime', nullable: true },
      consumedValue: { type: String, nullable: true },
      chargeCredits: { type: Number, nullable: true },
      finalOperationId: { type: String, nullable: true },
      failureReason: { type: 'text', nullable: true },
      compromisedReason: { type: 'text', nullable: true },
      settledAt: { type: 'datetime', nullable: true },
      createdAt: { type: 'datetime', createDate: true },
      updatedAt: { type: 'datetime', updateDate: true },
    },
    indices: [{ columns: ['usageId', 'meterId'], unique: true }],
  }),
  new EntitySchema<ResourceMeteringOperation>({
    name: 'ResourceMeteringOperation',
    target: ResourceMeteringOperation,
    tableName: 'resource_metering_operation',
    columns: {
      id: { type: String, primary: true },
      sessionId: { type: String, nullable: true },
      meterId: { type: Number, default: 1 },
      resourceId: { type: Number },
      kind: { type: String },
      status: { type: String },
      requestedAt: { type: 'datetime' },
      completedAt: { type: 'datetime', nullable: true },
      totalValue: { type: String, nullable: true },
      reportedValue: { type: String, nullable: true },
      readingMode: { type: String, nullable: true },
      observedAt: { type: 'datetime', nullable: true },
      source: { type: String, nullable: true },
      error: { type: 'text', nullable: true },
      createdAt: { type: 'datetime', createDate: true },
    },
  }),
];

type Handler = (options: {
  complete: (report: MeteringReport) => Promise<void>;
  kind: string;
  meterId: number;
}) => Promise<void>;

describe('Flow-defined metering', () => {
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
  let audit: { recordBillingTransactionAfterCommit: jest.Mock; recordResource: jest.Mock };
  let liveNotifications: { notifyTransactionUpdate: jest.Mock };

  const reading =
    (value: string, extra: Partial<Extract<MeteringReport, { kind: 'reading' }>> = {}): Handler =>
    ({ complete }) =>
      complete({ kind: 'reading', value, ...extra });

  const ready: Handler = ({ complete }) => complete({ kind: 'ready' });

  async function seedMeter(startData: object = {}, collectData: object = { finalRetryDelaySeconds: 0 }) {
    const nodes = source.getRepository(ResourceFlowNode);
    await nodes.save([
      { id: 'start', type: T.INPUT_METERING_START, resourceId: 1, data: { meterId: 1, ...startData } },
      { id: 'ready', type: T.OUTPUT_METERING_READY, resourceId: 1, data: { meterId: 1 } },
      { id: 'collect', type: T.INPUT_METERING_COLLECT, resourceId: 1, data: { meterId: 1, ...collectData } },
      {
        id: 'report',
        type: T.OUTPUT_METERING_REPORT,
        resourceId: 1,
        data: { meterId: 1, value: '1' },
      },
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
          options: { metering: { kind: string; meterId: number; complete: (report: MeteringReport) => Promise<void> } },
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
    await source.getRepository(ResourceMeter).save({ id: 1, resourceId: 1, name: 'Energy (kWh)', creditsPerUnit: 30 });
    metering = new ResourceMeteringService(
      source.getRepository(ResourceMeter),
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
        source.getRepository(ResourceUsageLifecycleAttempt),
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
      expect(await metering.getDefinition(1, 1)).toEqual(
        expect.objectContaining({ configured: false, problems: ['start-trigger-missing', 'collect-trigger-missing'] }),
      );
      await seedMeter();
      expect(await metering.getDefinition(1, 1)).toEqual(expect.objectContaining({ configured: true, problems: [] }));
      await source.getRepository(ResourceFlowEdge).delete({ id: 'e1' });
      await source.getRepository(ResourceFlowEdge).delete({ id: 'e2' });
      expect((await metering.getDefinition(1, 1)).problems).toEqual(['ready-unreachable', 'report-unreachable']);
    });

    it('applies the documented defaults to trigger settings', async () => {
      await seedMeter({}, {});
      const { start, collect } = await metering.getDefinition(1, 1);
      expect(start.timeoutSeconds).toBe(30);
      expect(collect).toEqual({
        meterId: 1,
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

      expect(session.meterRates).toEqual([{ meterId: 1, name: 'Energy (kWh)', creditsPerUnit: 30 }]);
      const { transaction, items: rows } = await items(ended.id);
      expect(transaction).toEqual(expect.objectContaining({ amount: -45, status: BillingTransactionStatus.Completed }));
      const energy = rows.find((item) => item.name === 'Energy (kWh)');
      expect(energy).toEqual(
        expect.objectContaining({
          unitPrice: 45,
          quantity: 1,
          meterQuantity: '1.5',
          meterCreditsPerUnit: 30,
          externalReference: expect.stringMatching(/^metering:.+:.+$/),
        }),
      );
      expect(await sessionOf(ended.id)).toEqual(
        expect.objectContaining({
          status: ResourceMeteringSessionStatus.Settled,
          chargeCredits: 45,
          consumedValue: '1500000000',
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
      await source.getRepository(ResourceMeter).update(1, { name: 'Heartbeats' });
      await expect(start()).rejects.toThrow(
        expect.objectContaining({ message: 'METER_INITIALIZATION_FAILED: METER_NOT_CONFIGURED: Heartbeats' }),
      );
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
        creditsPerUnit: 30,
      });
      await usage.recoverInterruptedLifecycles();
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
    });

    it('allows unconfigured tracking-only meters without blocking sessions', async () => {
      await source.getRepository(ResourceMeter).update(1, { creditsPerUnit: 0 });
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
      expect(rows.filter((item) => item.name === 'Energy (kWh)')).toEqual([
        expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 }),
      ]);
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
      expect(rows.find((item) => item.name === 'Energy (kWh)')).toEqual(
        expect.objectContaining({ unitPrice: 0, meterQuantity: '0' }),
      );
      expect((await sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
    });

    it.each([
      ['a non-numeric reading', reading('n/a')],
      ['an empty reading', reading('')],
      ['a negative reading', reading('-1')],
      ['a stale sample from before the stop', reading('1.5', { observedAt: '2020-01-01T00:00:00Z' })],
      ['a sample from the future', reading('1.5', { observedAt: '2999-01-01T00:00:00Z' })],
    ])('never turns %s into a zero charge', async (_name, handler) => {
      await seedMeter({}, { finalAttempts: 1 });
      await start();
      onCollect = handler;
      const ended = await end();
      const { transaction, items: rows } = await items(ended.id);
      expect(rows.filter((item) => item.name === 'Energy (kWh)')).toEqual([
        expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 }),
      ]);
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
      expect((await sessionOf(ended.id)).failureReason).toMatch(/cumulative counter decreased/);
    });

    it('counts a lifetime counter from its baseline and never mixes it with earlier consumption', async () => {
      await seedMeter();
      onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '1000' }, source: 'grid-meter' });
      await start();
      expect(
        (await source.getRepository(ResourceMeteringSession).findOneByOrFail({ resourceId: 1 })).baselineValue,
      ).toBe('1000000000000');
      onCollect = reading('1001.5', { source: 'grid-meter' });
      const ended = await end();
      const { transaction } = await items(ended.id);
      expect(transaction.amount).toBe(-45);
      expect((await sessionOf(ended.id)).consumedValue).toBe('1500000000');
    });

    it('bills migrated flow conversions from the converted counter baseline through ordinary completion nodes', async () => {
      await seedMeter();
      const nodes = source.getRepository(ResourceFlowNode);
      await nodes.update('ready', { data: { meterId: 1, baselineValue: '{{reading}}', legacyEnergyUnit: 'Wh' } });
      await nodes.update('report', { data: { meterId: 1, value: '{{reading}}', legacyEnergyUnit: '{{unit}}' } });
      const runner = source.createQueryRunner();
      try {
        await new MeterFlowConversions1790300000000().up(runner);
      } finally {
        await runner.release();
      }
      const completion = (complete: (report: MeteringReport) => Promise<void>, kind: 'start' | 'final') => ({
        compileTemplate: compileFlowTemplate,
        metering: { meterId: 1, operationId: 'op', kind, complete },
      });
      onStart = async ({ complete }) => {
        await new MeteringReadyExecutor().execute(
          await nodes.findOneByOrFail({ id: 'ready' }),
          { reading: '1000000' },
          completion(complete, 'start') as never,
        );
      };
      onCollect = async ({ complete }) => {
        await new MeteringReportExecutor(metering).execute(
          await nodes.findOneByOrFail({ id: 'report' }),
          { reading: '1001500', unit: 'Wh' },
          completion(complete, 'final') as never,
        );
      };
      await start();
      const ended = await end();
      const { transaction, items: rows } = await items(ended.id);
      expect(transaction.amount).toBe(-45);
      expect(rows).toEqual([expect.objectContaining({ meterQuantity: '1.5', meterCreditsPerUnit: 30, unitPrice: 45 })]);
      expect((await nodes.findOneByOrFail({ id: 'report' })).data).not.toHaveProperty('legacyEnergyUnit');
    });

    it('rejects a lifetime counter that dropped below its baseline', async () => {
      await seedMeter({}, { finalAttempts: 1 });
      onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '1000' } });
      await start();
      onCollect = reading('12');
      const ended = await end();
      expect((await sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
      expect((await sessionOf(ended.id)).failureReason).toMatch(/cumulative counter decreased/);
    });

    it('freezes the rate at session start so later rate changes do not alter the bill', async () => {
      await seedMeter();
      await start();
      await source.getRepository(ResourceMeter).update(1, { creditsPerUnit: 90 });
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
      expect((await items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)')).toHaveLength(1);
      // A second stop finds no active session and cannot add the energy again.
      await expect(end()).rejects.toBeInstanceOf(BadRequestException);
      expect((await items(ended.id)).transaction.amount).toBe(-45);
      // Settling again inside another transaction is a no-op.
      const finalOperation = await source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'final' });
      await source.transaction((manager) =>
        metering.settleInTransaction(manager, ended.id, {
          status: 'collected',
          meters: { [finalOperation.sessionId ?? 'missing']: { status: 'ready', operationId: finalOperation.id } },
        }),
      );
      expect((await items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)')).toHaveLength(1);
    });

    describe('takeover', () => {
      it('preserves increment-only charges when a later meter fails takeover initialization', async () => {
        const requestedMeter = await source.getRepository(ResourceMeter).save({
          resourceId: 1,
          name: 'Water',
          creditsPerUnit: 10,
        });
        await seedMeter({}, { finalAttempts: 1 });
        const nodes = source.getRepository(ResourceFlowNode);
        for (const node of await nodes.find()) {
          await nodes.update(node.id, { data: { ...node.data, meterId: requestedMeter.id } });
        }
        await nodes.save({
          id: 'increment-report',
          resourceId: 1,
          type: T.OUTPUT_METERING_REPORT,
          data: { meterId: 1, mode: 'increment', value: '1' },
        });
        const first = await start(users[0]);
        await metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
        const sessions = source.getRepository(ResourceMeteringSession);
        const untouched = await sessions.findOneByOrFail({ usageId: first.id, meterId: 1 });
        onStart = async () => {
          throw new Error('water meter start failed');
        };
        await expect(start(users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(BadRequestException);

        expect((await usage.getActiveSession(1, true))?.id).toBe(first.id);
        expect(await sessions.findOneByOrFail({ id: untouched.id })).toEqual(untouched);
        expect(await sessions.countBy({ status: ResourceMeteringSessionStatus.Active })).toBe(2);
        expect(await sessions.findOneByOrFail({ usageId: first.id, meterId: requestedMeter.id })).toEqual(
          expect.objectContaining({ compromisedReason: expect.stringMatching(/re-initialized by a takeover/) }),
        );

        await end(users[0]);
        const bill = await items(first.id);
        expect(bill.transaction.amount).toBe(-60);
        expect(bill.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'Energy (kWh)',
              meterQuantity: '2',
              meterCreditsPerUnit: 30,
              unitPrice: 60,
            }),
            expect.objectContaining({ name: 'Water', meterQuantity: null, meterCreditsPerUnit: 10, unitPrice: 0 }),
          ]),
        );
        expect((await sessions.findOneByOrFail({ id: untouched.id })).status).toBe(
          ResourceMeteringSessionStatus.Settled,
        );
      });

      it('preserves recovery for an untouched meter when another takeover start fails', async () => {
        await seedMeter({}, { finalAttempts: 1 });
        const secondMeter = await source.getRepository(ResourceMeter).save({
          resourceId: 1,
          name: 'Water',
          creditsPerUnit: 10,
        });
        const nodes = source.getRepository(ResourceFlowNode);
        const edges = source.getRepository(ResourceFlowEdge);
        for (const node of await nodes.find()) {
          await nodes.save({ ...node, id: `${node.id}-water`, data: { ...node.data, meterId: secondMeter.id } });
        }
        for (const edge of await edges.find()) {
          await edges.save({
            ...edge,
            id: `${edge.id}-water`,
            source: `${edge.source}-water`,
            target: `${edge.target}-water`,
          });
        }
        const first = await start(users[0]);
        onStart = async () => {
          throw new Error('first meter start failed');
        };
        await expect(start(users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(BadRequestException);
        const untouched = await source.getRepository(ResourceMeteringSession).findOneByOrFail({
          usageId: first.id,
          meterId: secondMeter.id,
        });
        expect(untouched.compromisedReason).toBeNull();
        onCollect = async () => {
          throw new Error('temporarily offline');
        };
        const ended = await end(users[0]);
        expect((await source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: untouched.id })).status).toBe(
          ResourceMeteringSessionStatus.Pending,
        );
        onCollect = reading('2', { observedAt: ended.endTime?.toISOString() });
        await metering.retrySettlement(1, untouched.id, users[0].id);
        expect((await correctionsOf(first.id)).corrections[0].amount).toBe(-20);
      });

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
        expect((await usage.getActiveSession(1, true))?.id).toBe(first.id);
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
        expect((await items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)')).toEqual([
          expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 }),
        ]);
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
        onCollect = reading('1.5', { observedAt: ended.endTime?.toISOString() });
        return ended;
      }

      it.each([
        ['advancing', '105', '12000000000'],
        ['reset', '4', '7000000000'],
      ])(
        'invalidates pending charges after an accepted %s free baseline even if another branch fails',
        async (_kind, baseline, lifetimeValue) => {
          await source.getRepository(ResourceMeter).update(1, {
            counterValue: '100000000000',
            lifetimeValue: '7000000000',
          });
          onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '100' } });
          const ended = await endWithMissingFinal();
          const session = await sessionOf(ended.id);
          const before = await items(ended.id);
          const priorMeter = await source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 });
          const unrelatedMeter = await source.getRepository(ResourceMeter).save({
            resourceId: 1,
            name: 'Water',
            creditsPerUnit: 0,
          });
          const unrelatedSession = await source.getRepository(ResourceMeteringSession).save({
            ...session,
            id: 'unrelated-pending',
            meterId: unrelatedMeter.id,
            meterName: unrelatedMeter.name,
          });
          await metering.setRate(1, 1, 0);
          onStart = async ({ complete }) => {
            await complete({ kind: 'ready', baseline: { value: baseline }, source: 'reinitialized-meter' });
            throw new Error('another start branch failed');
          };

          const started = await start(users[1]);
          expect((await usage.getActiveSession(1, true))?.id).toBe(started.id);
          expect(await source.getRepository(ResourceMeteringSession).countBy({ usageId: started.id })).toBe(0);
          const acceptedMeter = await source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 });
          expect(acceptedMeter).toEqual(
            expect.objectContaining({
              counterValue: `${baseline}000000000`,
              lifetimeValue,
              latestObservedAt: expect.any(Date),
            }),
          );
          expect(acceptedMeter.latestObservedAt?.getTime()).toBeGreaterThanOrEqual(
            priorMeter.latestObservedAt?.getTime() ?? 0,
          );
          expect(await sessionOf(ended.id)).toEqual(
            expect.objectContaining({
              status: ResourceMeteringSessionStatus.Failed,
              failureReason: 'The meter was re-initialized for a later session',
            }),
          );
          expect((await metering.getStatus(1)).unsettled).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ sessionId: session.id, retryable: false, status: 'failed' }),
              expect.objectContaining({ sessionId: unrelatedSession.id, retryable: true, status: 'pending' }),
            ]),
          );
          expect(
            await source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: unrelatedSession.id }),
          ).toEqual(unrelatedSession);

          // Even valid historical end-boundary evidence cannot charge an invalidated session.
          onCollect = jest.fn(reading('101.5', { observedAt: ended.endTime?.toISOString() }));
          await expect(metering.retrySettlement(1, session.id, 1)).rejects.toThrow('METER_SESSION_NOT_PENDING');
          expect(onCollect).not.toHaveBeenCalled();
          expect((await correctionsOf(ended.id)).corrections).toEqual([]);
          expect(await items(ended.id)).toEqual(before);
          expect(audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
          expect(liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
        },
      );

      it('keeps an older charge pending when a free start fails before acknowledging', async () => {
        const ended = await endWithMissingFinal();
        const session = await sessionOf(ended.id);
        const before = await items(ended.id);
        await metering.setRate(1, 1, 0);
        const priorMeter = await source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 });
        onStart = async () => {
          throw new Error('offline before acknowledgement');
        };

        const started = await start(users[1]);
        expect((await usage.getActiveSession(1, true))?.id).toBe(started.id);
        expect(await source.getRepository(ResourceMeteringSession).countBy({ usageId: started.id })).toBe(0);
        expect(await source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 })).toEqual(priorMeter);
        expect(await sessionOf(ended.id)).toEqual(session);
        expect((await metering.getStatus(1)).unsettled).toEqual([
          expect.objectContaining({ sessionId: session.id, retryable: true, status: 'pending' }),
        ]);
        expect(await items(ended.id)).toEqual(before);
        expect((await correctionsOf(ended.id)).corrections).toEqual([]);
        expect(audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
        expect(liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
      });

      it('invalidates an older pending charge when the next start uses only increments', async () => {
        const ended = await endWithMissingFinal();
        const session = await sessionOf(ended.id);
        await source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
        await source.getRepository(ResourceFlowNode).save({
          id: 'increment-report',
          type: T.OUTPUT_METERING_REPORT,
          resourceId: 1,
          data: { meterId: 1, mode: 'increment', value: '1' },
        });
        const startFlow = jest.fn(ready);
        onStart = startFlow;

        const started = await start(users[1]);
        expect((await sessionOf(started.id)).collectionMode).toBe('increment');
        expect(startFlow).not.toHaveBeenCalled();
        expect((await sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Failed);
        expect((await metering.getStatus(1)).unsettled).toEqual([
          expect.objectContaining({ sessionId: session.id, retryable: false }),
        ]);
      });

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
            source: 'meter-correction',
          }),
          expect.anything(),
        );
        expect(liveNotifications.notifyTransactionUpdate).toHaveBeenCalledWith(corrections[0].id);
        expect(correctionItems.filter((item) => item.name === 'Energy (kWh)')).toHaveLength(1);
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

      it('rounds a large late correction exactly at the half-credit boundary', async () => {
        const ended = await endWithMissingFinal();
        const session = await sessionOf(ended.id);
        await source.getRepository(ResourceUsage).update(ended.id, { billingFactor: 50 });
        await source.getRepository(ResourceMeteringSession).update(session.id, { creditsPerUnit: 1 });
        onCollect = ({ complete }) =>
          complete({
            kind: 'reading',
            value: '9007199254740991',
            observedAt: ended.endTime?.toISOString(),
          });
        await metering.retrySettlement(1, session.id, 1);
        const { corrections, items: rows } = await correctionsOf(ended.id);
        expect(corrections[0].amount).toBe(-4503599627370495);
        expect(rows.find((item) => item.name === 'BILLING_FACTOR')?.unitPrice).toBe(-4503599627370496);
      });

      it.each([undefined, 'after-end'])('rejects a retry first observing idle consumption (%s)', async (timestamp) => {
        const ended = await endWithMissingFinal();
        const session = await sessionOf(ended.id);
        onCollect = reading('5', {
          observedAt: timestamp ? new Date((ended.endTime as Date).getTime() + 1).toISOString() : undefined,
        });
        await expect(metering.retrySettlement(1, session.id, 1)).rejects.toThrow('session end boundary');
        expect((await correctionsOf(ended.id)).corrections).toEqual([]);
        expect((await source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 })).counterValue).toBe('0');
        expect((await sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
      });

      it('keeps the charge pending with the reason when the retry is stale or invalid', async () => {
        const ended = await endWithMissingFinal();
        onCollect = reading('1.5', { observedAt: '2020-01-01T00:00:00Z' });
        await expect(metering.retrySettlement(1, (await sessionOf(ended.id)).id, 1)).rejects.toThrow(
          expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }),
        );
        expect(await sessionOf(ended.id)).toEqual(
          expect.objectContaining({ status: 'pending', failureReason: expect.stringMatching(/session end boundary/) }),
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
          expect.objectContaining({ action: 'meter_charge.waived', actorId: 7, subjectId: 1 }),
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

    it('rejects a reply that arrives after the operation timed out', async () => {
      const session = await activeSession();
      let lateReply: Promise<void> | undefined;
      onCollect = ({ complete }) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            lateReply = complete({ kind: 'reading', value: '9' });
            lateReply.then(resolve, resolve);
          }, 1300);
        });
      await expect(run(session, 'interim', 1)).rejects.toThrow(/did not reply within 1s/);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await expect(lateReply).rejects.toThrow(/already answered or has expired/);
      const operation = await source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' });
      expect(operation).toEqual(expect.objectContaining({ status: 'expired', totalValue: null }));
      expect(
        (await source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: session.id })).latestValue,
      ).toBeNull();
    }, 10_000);

    it('accepts an identical duplicate reply and rejects a conflicting one', async () => {
      const session = await activeSession();
      onCollect = async ({ complete }) => {
        await complete({ kind: 'reading', value: '1' });
        await complete({ kind: 'reading', value: '1.000000000' });
      };
      expect((await run(session)).totalValue).toBe('1000000000');

      onCollect = async ({ complete }) => {
        await complete({ kind: 'reading', value: '1.2' });
        await complete({ kind: 'reading', value: '1.3' });
      };
      await expect(run(session)).rejects.toThrow(/already answered/);
    });

    it('rejects a reply of the wrong kind and a report for an unknown resource', async () => {
      const session = await activeSession();
      onCollect = ({ complete }) => complete({ kind: 'ready' });
      await expect(run(session)).rejects.toThrow(/does not answer/);

      const { MeteringReportExecutor } = await import('../flows/node-executors');
      await expect(
        new MeteringReportExecutor(metering).execute(
          { resourceId: 99, data: { meterId: 1, value: '1' } } as never,
          {},
          {
            compileTemplate: (t: string) => t,
          } as never,
        ),
      ).rejects.toThrow(/METER_NOT_FOUND/);
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
        await complete({ kind: 'reading', value: kind === 'final' ? '2' : '1' });
        running--;
      };
      const [interim, final] = await Promise.all([run(session, 'interim'), run(session, 'final')]);
      expect(peak).toBe(1);
      expect([interim.totalValue, final.totalValue]).toEqual(['1000000000', '2000000000']);
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
      expect((await metering.getLive(1)).meters[0].session).toEqual(
        expect.objectContaining({ latestValue: null, chargeCredits: null, creditsPerUnit: 30 }),
      );
      onCollect = reading('0.05');
      await run(session);
      expect((await metering.getLive(1)).meters[0].session).toEqual(
        expect.objectContaining({ sessionId: session.id, latestValue: '0.05', chargeCredits: 2, creditsPerUnit: 30 }),
      );
      await usage.endSession(1, users[0], {} as never);
      expect((await metering.getLive(1)).meters[0].session).toBeNull();
    });

    it('records interim readings for display only and skips busy or disabled meters', async () => {
      const session = await activeSession();
      await source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
      await source.getRepository(ResourceMeter).update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      onCollect = reading('0.7');
      await metering.collectInterimReadings();
      expect((await metering.getLive(1)).meters[0].session).toEqual(expect.objectContaining({ latestValue: '0.7' }));

      await source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      await source
        .getRepository(ResourceFlowNode)
        .update({ id: 'collect' }, { data: { meterId: 1, interimIntervalMinutes: 0 } });
      onCollect = reading('0.9');
      await metering.collectInterimReadings();
      expect((await metering.getLive(1)).meters[0].session).toEqual(expect.objectContaining({ latestValue: '0.7' }));
    });

    it('does not poll a meter that keeps failing more often than its interval', async () => {
      const session = await activeSession();
      await source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
      await source.getRepository(ResourceMeter).update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      const collect = jest.fn().mockRejectedValue(new Error('meter unreachable'));
      onCollect = collect;
      await metering.collectInterimReadings();
      await metering.collectInterimReadings();
      expect(collect).toHaveBeenCalledTimes(1);
    });
  });
  describe('generic meters', () => {
    it('preserves concurrent consumption and pricing when renaming a meter', async () => {
      const manager = source.manager;
      const findOne = manager.findOne.bind(manager);
      jest.spyOn(manager, 'findOne').mockImplementationOnce(async (...args) => {
        const snapshot = await findOne(...args);
        await manager.update(ResourceMeter, 1, {
          lifetimeValue: '3000000000',
          counterValue: '3000000000',
          creditsPerUnit: 99,
        });
        return snapshot;
      });
      await metering.updateMeter(1, 1, 'Renamed');
      expect((await metering.listMeters(1))[0]).toEqual(
        expect.objectContaining({
          name: 'Renamed',
          lifetimeValue: '3',
          counterValue: '3',
          creditsPerUnit: 99,
        }),
      );
    });

    it('loads one flow snapshot for all meters in a status poll', async () => {
      await seedMeter();
      await metering.createMeter(1, 'Heartbeats');
      const nodes = jest.spyOn(source.getRepository(ResourceFlowNode), 'find');
      const edges = jest.spyOn(source.getRepository(ResourceFlowEdge), 'find');
      expect((await metering.getStatus(1)).meters).toHaveLength(2);
      expect(nodes).toHaveBeenCalledTimes(1);
      expect(edges).toHaveBeenCalledTimes(1);
    });

    it('allows resource usage when a tracking-only start fails', async () => {
      await seedMeter();
      await metering.setRate(1, 1, 0);
      onStart = async () => {
        throw new Error('offline');
      };
      const started = await usage.startSession(1, users[0], {} as never);
      expect(started.endTime).toBeNull();
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
      await usage.endSession(1, users[0], {} as never);
      expect((await items(started.id)).transaction.amount).toBe(0);
    });

    it('rejects an idle collection reply after an increment session starts', async () => {
      await seedMeter();
      await source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
      let reply!: () => Promise<void>;
      let signal!: () => void;
      const waiting = new Promise<void>((resolve) => {
        signal = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      onCollect = async ({ complete }) => {
        reply = () => complete({ kind: 'reading', value: '105' });
        signal();
        await gate;
      };
      const collection = metering.collectInterimReadings();
      await waiting;
      await source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
      await source.getRepository(ResourceFlowNode).save({
        id: 'increment-report',
        resourceId: 1,
        type: T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      const started = await usage.startSession(1, users[0], {} as never);
      try {
        await expect(reply()).rejects.toThrow('session boundary');
        expect((await metering.listMeters(1))[0].counterValue).toBe('100');
        expect((await sessionOf(started.id)).latestValue).toBe('0');
      } finally {
        release();
        await collection;
      }
    });

    it('records increments without a session and keeps other meters independent', async () => {
      const other = await metering.createMeter(1, 'Heartbeats');
      await metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '2.5' });
      await metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '3.25' });
      const meters = await metering.listMeters(1);
      expect(meters.find((m) => m.id === other.id)).toEqual(
        expect.objectContaining({ lifetimeValue: '5.75', session: null }),
      );
      expect(meters.find((m) => m.id === 1)?.lifetimeValue).toBe('0');
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
      await expect(metering.report(99, other.id, { kind: 'reading', value: '1' })).rejects.toThrow('METER_NOT_FOUND');
    });

    it('uses the first cumulative reading as a baseline and never double-counts repeated totals', async () => {
      await metering.report(1, 1, { kind: 'reading', value: '100' });
      await metering.report(1, 1, { kind: 'reading', value: '102.25' });
      await metering.report(1, 1, { kind: 'reading', value: '102.25' });
      expect((await metering.listMeters(1))[0].lifetimeValue).toBe('2.25');
      await expect(metering.report(1, 1, { kind: 'reading', value: '99' })).rejects.toThrow('counter decreased');
      expect((await metering.listMeters(1))[0].lifetimeValue).toBe('2.25');
    });

    it('bills multiple meters at captured rates and names while idle increments remain unbilled', async () => {
      await seedMeter();
      const other = await metering.createMeter(1, 'Heartbeats');
      await metering.setRate(1, other.id, 2);
      await source.getRepository(ResourceFlowNode).save({
        id: 'heartbeat-report',
        resourceId: 1,
        type: T.OUTPUT_METERING_REPORT,
        data: { meterId: other.id, mode: 'increment', value: '1' },
      });
      await metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '4' });
      const started = await usage.startSession(1, users[0], {} as never);
      await metering.setRate(1, other.id, 100);
      await metering.updateMeter(1, other.id, 'Renamed heartbeats');
      await metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '3' });
      await metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '2' });
      expect((await metering.getLive(1)).meters.find((meter) => meter.id === other.id)).toEqual(
        expect.objectContaining({
          name: 'Renamed heartbeats',
          creditsPerUnit: 100,
          session: expect.objectContaining({ meterName: 'Heartbeats', creditsPerUnit: 2, latestValue: '5' }),
        }),
      );
      await usage.endSession(1, users[0], {} as never);
      const bill = await items(started.id);
      expect(bill.transaction.amount).toBe(-55);
      expect(bill.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Heartbeats', meterQuantity: '5', meterCreditsPerUnit: 2, unitPrice: 10 }),
          expect.objectContaining({ name: 'Energy (kWh)', meterQuantity: '1.5', unitPrice: 45 }),
        ]),
      );
      await metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '7' });
      expect((await metering.listMeters(1)).find((m) => m.id === other.id)?.lifetimeValue).toBe('16');
      expect((await items(started.id)).transaction.amount).toBe(-55);
    });

    it('counts alternating cumulative readings and increments once while idle', async () => {
      await metering.report(1, 1, { kind: 'reading', value: '100' });
      await metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      await metering.report(1, 1, { kind: 'reading', value: '103' });
      expect((await metering.listMeters(1))[0]).toEqual(
        expect.objectContaining({ lifetimeValue: '3', counterValue: '103', session: null }),
      );
    });

    it('bills mixed session readings once and excludes consumption before the session', async () => {
      await seedMeter();
      await metering.report(1, 1, { kind: 'reading', value: '100' });
      onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '100' } });
      const started = await usage.startSession(1, users[0], {} as never);
      await metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      await metering.report(1, 1, { kind: 'reading', value: '103' });
      expect((await metering.listMeters(1))[0].session?.latestValue).toBe('3');
      onCollect = reading('104');
      await usage.endSession(1, users[0], {} as never);
      expect((await items(started.id)).transaction.amount).toBe(-120);
      expect((await metering.listMeters(1))[0].lifetimeValue).toBe('4');
    });

    it.each(['total', undefined])('rejects mixed push-only definitions with a %s report', async (mode) => {
      await metering.report(1, 1, { kind: 'reading', value: '100' });
      await source.getRepository(ResourceFlowNode).save([
        {
          id: 'increment-report',
          resourceId: 1,
          type: T.OUTPUT_METERING_REPORT,
          data: { meterId: 1, mode: 'increment', value: '1' },
        },
        {
          id: 'total-report',
          resourceId: 1,
          type: T.OUTPUT_METERING_REPORT,
          data: { meterId: 1, mode, value: '105' },
        },
      ]);
      expect(await metering.getDefinition(1, 1)).toMatchObject({ configured: false, incrementOnly: false });
      await expect(usage.startSession(1, users[0], {} as never)).rejects.toThrow('METER_NOT_CONFIGURED');
      expect(await source.getRepository(ResourceMeteringSession).count()).toBe(0);
      expect((await metering.getLive(1)).meters[0]).toMatchObject({ lifetimeValue: '0', counterValue: '100' });
    });

    it('rejects cumulative readings after an increment session definition changes', async () => {
      await metering.report(1, 1, { kind: 'reading', value: '100' });
      await source.getRepository(ResourceFlowNode).save({
        id: 'increment-report',
        resourceId: 1,
        type: T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      const started = await usage.startSession(1, users[0], {} as never);
      await metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      // Adding fresh boundary branches cannot retroactively establish the original start baseline.
      await seedMeter();
      expect(await metering.getDefinition(1, 1)).toMatchObject({ configured: true, incrementOnly: false });
      await expect(metering.report(1, 1, { kind: 'reading', value: '105' })).rejects.toThrow('increment-only');
      expect((await metering.getLive(1)).meters[0]).toMatchObject({
        lifetimeValue: '2',
        counterValue: '102',
        session: { latestValue: '2' },
      });
      await metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '1' });
      await usage.endSession(1, users[0], {} as never);
      expect((await items(started.id)).transaction.amount).toBe(-90);
      expect((await metering.listMeters(1))[0].lifetimeValue).toBe('3');
    });

    it('keeps tracking-only meters live during sessions', async () => {
      await seedMeter();
      await metering.setRate(1, 1, 0);
      const started = await usage.startSession(1, users[0], {} as never);
      const session = await sessionOf(started.id);
      onCollect = reading('3');
      await metering['runOperation'](session, 'interim', { trigger: T.INPUT_METERING_COLLECT, timeoutSeconds: 5 });
      expect((await metering.getLive(1)).meters[0]).toEqual(
        expect.objectContaining({
          lifetimeValue: '3',
          session: expect.objectContaining({ latestValue: '3', chargeCredits: 0 }),
        }),
      );
      await usage.endSession(1, users[0], {} as never);
      expect((await items(started.id)).items).toEqual([
        expect.objectContaining({ meterQuantity: '3', meterCreditsPerUnit: 0, unitPrice: 0 }),
      ]);
    });

    it.each(['en', 'de'])(
      'carries paid, free, zero and unavailable meter evidence from settlement into the %s receipt',
      async (locale) => {
        await seedMeter({}, { finalAttempts: 1 });
        const meters = source.getRepository(ResourceMeter);
        const free = await meters.save({ resourceId: 1, name: 'Free Heartbeats', creditsPerUnit: 0 });
        const zero = await meters.save({ resourceId: 1, name: 'Zero Heartbeats', creditsPerUnit: 0 });
        const unavailable = await meters.save({ resourceId: 1, name: 'PER_MINUTE', creditsPerUnit: 17 });
        const nodes = source.getRepository(ResourceFlowNode);
        const edges = source.getRepository(ResourceFlowEdge);
        for (const meter of [free, zero, unavailable]) {
          for (const node of await nodes.find({ where: { resourceId: 1 } })) {
            if (node.data.meterId !== 1) continue;
            await nodes.save({ ...node, id: `${node.id}-${meter.id}`, data: { ...node.data, meterId: meter.id } });
          }
          await edges.save([
            {
              id: `start-${meter.id}`,
              resourceId: 1,
              source: `start-${meter.id}`,
              sourceHandle: 'output',
              target: `ready-${meter.id}`,
              targetHandle: 'input',
            },
            {
              id: `collect-${meter.id}`,
              resourceId: 1,
              source: `collect-${meter.id}`,
              sourceHandle: 'output',
              target: `report-${meter.id}`,
              targetHandle: 'input',
            },
          ]);
        }
        const started = await usage.startSession(1, users[0], {} as never);
        await metering.updateMeter(1, free.id, 'Renamed later');
        await metering.setRate(1, free.id, 100);
        onCollect = async ({ complete, meterId }) => {
          if (meterId === unavailable.id) throw new Error('Device offline');
          await complete({ kind: 'reading', value: meterId === zero.id ? '0' : '1.5' });
        };
        await usage.endSession(1, users[0], {} as never);
        const bill = await items(started.id);
        expect(bill.transaction.amount).toBe(-45);
        expect(bill.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'Energy (kWh)',
              meterQuantity: '1.5',
              meterCreditsPerUnit: 30,
              unitPrice: 45,
            }),
            expect.objectContaining({
              name: 'Free Heartbeats',
              meterQuantity: '1.5',
              meterCreditsPerUnit: 0,
              unitPrice: 0,
            }),
            expect.objectContaining({
              name: 'Zero Heartbeats',
              meterQuantity: '0',
              meterCreditsPerUnit: 0,
              unitPrice: 0,
            }),
            expect.objectContaining({ name: 'PER_MINUTE', meterQuantity: null, meterCreditsPerUnit: 17, unitPrice: 0 }),
          ]),
        );
        expect(bill.items).toHaveLength(4);
        const email = Object.create(EmailService.prototype) as EmailService;
        const sendEmail = jest.fn();
        Object.assign(email, { getBaseContext: async () => ({}), sendEmail });
        const storedUsage = await source
          .getRepository(ResourceUsage)
          .findOneOrFail({ where: { id: started.id }, relations: ['resource'] });
        await email.sendResourceUsageBillingSummaryEmail(
          Object.assign(users[0], { email: 'owner@example.com', locale }),
          Object.assign(bill.transaction, { items: bill.items }),
          storedUsage,
          2,
        );
        const context = sendEmail.mock.calls[0][2];
        const renderer = Handlebars.create();
        renderer.registerHelper('t', (key, fallback, options) => {
          const value =
            SHIPPED_TRANSLATIONS.find(
              (row) =>
                row.templateType === EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY &&
                row.locale === locale &&
                row.key === key,
            )?.value ?? fallback;
          return String(value).replace(/\{(\w+)\}/g, (_match, name) => String(options.hash[name] ?? ''));
        });
        const receipt = renderer.compile(
          readDefaultTemplateBody(EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY),
        )(context);
        for (const name of ['Free Heartbeats', 'Zero Heartbeats', 'PER_MINUTE']) expect(receipt).toContain(name);
        expect(receipt).toContain(locale === 'de' ? 'Nicht verfügbar' : 'Unavailable');
        expect(receipt).not.toContain('Renamed later');
        expect(context.items.find((item: { name: string }) => item.name === 'PER_MINUTE')).toMatchObject({
          isUnavailable: true,
          isDuration: false,
          quantity: '—',
        });
        expect(context.totalCredits).toBe(0.45);
        const before = await items(started.id);
        const pending = await source
          .getRepository(ResourceMeteringSession)
          .findOneByOrFail({ usageId: started.id, meterId: unavailable.id });
        onCollect = reading('2', { observedAt: storedUsage.endTime?.toISOString() });
        await metering.retrySettlement(1, pending.id, users[0].id);
        expect(await items(started.id)).toEqual(before);
        expect((await correctionsOf(started.id)).corrections).toEqual([expect.objectContaining({ amount: -34 })]);
      },
    );

    it('periodically collects idle consumption without adding it to the completed bill', async () => {
      await seedMeter();
      const started = await usage.startSession(1, users[0], {} as never);
      await usage.endSession(1, users[0], {} as never);
      await source.getRepository(ResourceMeter).update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      onCollect = reading('2.5');
      await metering.collectInterimReadings();
      expect((await metering.listMeters(1))[0]).toEqual(
        expect.objectContaining({ lifetimeValue: '2.5', session: null }),
      );
      expect((await items(started.id)).transaction.amount).toBe(-45);
      expect(
        (await source.getRepository(ResourceMeteringOperation).find()).some(
          (operation) => operation.sessionId === null,
        ),
      ).toBe(true);
    });

    it('keeps an increment session billable after its flow is edited', async () => {
      await seedMeter();
      await source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
      await source.getRepository(ResourceFlowNode).save({
        id: 'increment-report',
        resourceId: 1,
        type: T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      const started = await usage.startSession(1, users[0], {} as never);
      await metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
      await source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
      await usage.endSession(1, users[0], {} as never);
      expect((await items(started.id)).transaction.amount).toBe(-60);
      expect((await sessionOf(started.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
    });

    it('does not charge idle consumption when a missing final reading is retried', async () => {
      await seedMeter();
      const started = await usage.startSession(1, users[0], {} as never);
      onCollect = async () => {
        throw new Error('offline');
      };
      await usage.endSession(1, users[0], {} as never);
      const session = await sessionOf(started.id);
      expect(session.status).toBe(ResourceMeteringSessionStatus.Pending);
      await metering.report(1, 1, { kind: 'reading', value: '3' });
      expect((await sessionOf(started.id)).status).toBe(ResourceMeteringSessionStatus.Failed);
      await expect(metering.retrySettlement(1, session.id, users[0].id)).rejects.toThrow();
      expect((await items(started.id)).transaction.amount).toBe(0);
    });

    it('records one increment per flow node execution and rejects conflicting replays', async () => {
      const report = { kind: 'reading' as const, mode: 'increment' as const, value: '3' };
      await metering.report(1, 1, report, undefined, undefined, 'flow:1:node');
      await metering.report(1, 1, report, undefined, undefined, 'flow:1:node');
      expect((await metering.listMeters(1))[0].lifetimeValue).toBe('3');
      await expect(
        metering.report(1, 1, { ...report, value: '4' }, undefined, undefined, 'flow:1:node'),
      ).rejects.toThrow('conflicting');
    });

    it.each([{ observedAt: '2020-01-01T00:00:00Z' }, { observedAt: 'invalid' }, { source: 'different-device' }])(
      'rejects conflicting replay evidence %j for ordinary and collected readings',
      async (conflict) => {
        const report = { kind: 'reading' as const, mode: 'increment' as const, value: '3', source: 'device' };
        await metering.report(1, 1, report, undefined, undefined, 'ordinary');
        await metering.report(1, 1, report, undefined, undefined, 'ordinary');
        await expect(
          metering.report(1, 1, { ...report, ...conflict }, undefined, undefined, 'ordinary'),
        ).rejects.toThrow('conflicting');
        const observedAt = new Date().toISOString();
        const operation = await source.getRepository(ResourceMeteringOperation).save({
          id: 'collection',
          meterId: 1,
          resourceId: 1,
          kind: 'interim',
          status: 'pending',
          requestedAt: new Date(),
        });
        await metering['readings'].complete(operation.id, { ...report, observedAt });
        await metering['readings'].complete(operation.id, { ...report, observedAt });
        await expect(
          metering['readings'].complete(operation.id, { ...report, observedAt, ...conflict }),
        ).rejects.toThrow('answered');
        expect((await metering.listMeters(1))[0].lifetimeValue).toBe('6');
      },
    );
  });
});

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
  ResourceOperatingInterval,
  ResourceType,
  ResourceUsage,
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
import { MeteringReport } from '../flows/node-executors';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { seedFlowMeter } from './metering-flow-seed.test-fixture';
import { T, schemas } from './metering-persistence-schema.test-fixture';
import { Handler, reading, ready } from './metering-report-handlers.test-fixture';
import { ResourceMeteringService } from './resource-metering.service';

export function registerFlowDefinedEnergyMeteringFixture() {
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
  const seedMeter = (startData: object = {}, collectData: object = { finalRetryDelaySeconds: 0 }) =>
    seedFlowMeter(source, startData, collectData);

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
  return {
    get T() {
      return T;
    },
    get source() {
      return source;
    },
    get metering() {
      return metering;
    },
    get usage() {
      return usage;
    },
    get users() {
      return users;
    },
    get log() {
      return log;
    },
    get onStart() {
      return onStart;
    },
    get onCollect() {
      return onCollect;
    },
    get startEffects() {
      return startEffects;
    },
    get configRate() {
      return configRate;
    },
    get audit() {
      return audit;
    },
    get liveNotifications() {
      return liveNotifications;
    },
    get reading() {
      return reading;
    },
    get ready() {
      return ready;
    },
    get seedMeter() {
      return seedMeter;
    },
    get items() {
      return items;
    },
    get correctionsOf() {
      return correctionsOf;
    },
    get sessionOf() {
      return sessionOf;
    },
    set onStart(value: typeof onStart) {
      onStart = value;
    },
    set onCollect(value: typeof onCollect) {
      onCollect = value;
    },
    set startEffects(value: typeof startEffects) {
      startEffects = value;
    },
    set configRate(value: typeof configRate) {
      configRate = value;
    },
  };
}

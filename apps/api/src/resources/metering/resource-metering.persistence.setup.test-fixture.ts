import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
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
  ResourceOperatingInterval,
  ResourceType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { DataSource, EntityManager } from 'typeorm';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { MeteringReport } from '../flows/node-executors';
import { ResourceMeteringService } from './resource-metering.service';
import { FlowDefinedMeteringTestScope } from './resource-metering.persistence.spec';
export async function resetTestFixture(scope: FlowDefinedMeteringTestScope) {
  for (const method of ['debug', 'log', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
  }
  scope.directory = await mkdtemp(join(tmpdir(), 'attraccess-metering-'));
  scope.source = await new DataSource({
    type: 'sqlite',
    database: join(scope.directory, 'test.sqlite'),
    synchronize: true,
    entities: scope.schemas,
  }).initialize();
  await scope.source.getRepository(Resource).save({
    id: 1,
    name: 'Laser',
    type: ResourceType.Machine,
    allowTakeOver: true,
    supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
  });
  scope.users = await scope.source.getRepository(User).save([
    { id: 1, username: 'owner' },
    { id: 2, username: 'next-user' },
  ]);
  scope.users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(['resources.update']) }));

  scope.log = [];
  scope.onStart = scope.ready;
  scope.onCollect = scope.reading('1.5');
  scope.startEffects = async () => undefined;
  scope.flows = {
    trackResourceActivity: jest.fn(),
    runFlow: jest.fn(
      async (
        _resourceId: number,
        type: ResourceFlowNodeType,
        _payload: object,
        _manager: unknown,
        options: { metering: { kind: string; meterId: number; complete: (report: MeteringReport) => Promise<void> } },
      ) => {
        if (type === scope.T.INPUT_METERING_START) {
          scope.log.push('meter:start');
          await scope.onStart(options.metering);
        } else if (type === scope.T.INPUT_METERING_COLLECT) {
          scope.log.push(`meter:${options.metering.kind}`);
          await scope.onCollect(options.metering);
        } else {
          scope.log.push(`flow:${type}`);
          if (type === scope.T.INPUT_RESOURCE_USAGE_STARTED || type === scope.T.INPUT_RESOURCE_USAGE_TAKEOVER) {
            await scope.startEffects();
          }
        }
        return [];
      },
    ),
  };
  scope.audit = { recordBillingTransactionAfterCommit: jest.fn(), recordResource: jest.fn() };
  scope.liveNotifications = { notifyTransactionUpdate: jest.fn().mockResolvedValue(undefined) };
  await scope.source
    .getRepository(ResourceMeter)
    .save({ id: 1, resourceId: 1, name: 'Energy (kWh)', creditsPerUnit: 30 });
  scope.metering = new ResourceMeteringService(
    scope.source.getRepository(ResourceMeter),
    scope.source.getRepository(ResourceMeteringSession),
    scope.source.getRepository(ResourceMeteringOperation),
    scope.source.getRepository(ResourceFlowNode),
    scope.source.getRepository(ResourceFlowEdge),
    scope.flows as never,
    scope.audit as never,
    scope.liveNotifications as never,
  );
  const billing = {
    getResourceBillingConfiguration: jest.fn(async () => ({
      creditsPerUsage: 0,
      creditsPerMinute: 0,
      creditsPerOperatingMinute: 0,
    })),
    validateResourceUsageStart: jest.fn().mockResolvedValue(undefined),
    handleResourceUsageStart: jest.fn(async (_id: number, session: ResourceUsage, user: User, manager: EntityManager) =>
      manager.save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      }),
    ),
    // The real charge sums the items already on the transaction; that is all these tests need from it.
    chargeForResourceUsage: jest.fn(async (session: ResourceUsage, manager: EntityManager) => {
      scope.log.push('charge');
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
  scope.usage = new ResourceUsageService(
    scope.source.getRepository(Resource),
    scope.source.getRepository(ResourceUsage),
    scope.source.getRepository(User),
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
      scope.source.getRepository(ResourceOperatingInterval),
      scope.source.getRepository(ResourceUsage),
      scope.source.getRepository(ResourceUsageLifecycleAttempt),
    ),
    scope.flows as never,
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
    scope.metering,
  );
}

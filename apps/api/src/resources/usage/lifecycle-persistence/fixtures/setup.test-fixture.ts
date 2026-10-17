import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import {
  BillingTransaction,
  BillingTransactionStatus,
  Form,
  Resource,
  ResourceOperatingInterval,
  ResourceType,
  ResourceUsage,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { DataSource, EntityManager } from 'typeorm';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResourceUsageService } from '../../sessions/resource-usage.service';
import { ResourceOperatingIntervalService } from '../../../operating-intervals/resource-operating-interval.service';
import { ResourceOperatingAttributionService } from '../../../operating-intervals/resource-operating-attribution.service';
import { USAGE_RECOVERY_TABLE_SQL } from '../../../../database/resource-usage-integrity';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from '../lifecycle.persistence.spec';
export async function resetTestFixture(scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope) {
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  scope.directory = await mkdtemp(join(tmpdir(), 'attraccess-lifecycle-'));
  scope.source = await new DataSource({
    type: 'sqlite',
    database: join(scope.directory, 'test.sqlite'),
    synchronize: true,
    entities: scope.schemas,
  }).initialize();
  await scope.source.query(USAGE_RECOVERY_TABLE_SQL);
  await scope.source.getRepository(Resource).save({
    id: 1,
    name: 'Machine',
    type: ResourceType.Machine,
    allowTakeOver: true,
    supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
  });
  scope.users = await scope.source.getRepository(User).save([
    { id: 1, username: 'owner' },
    { id: 2, username: 'next-user' },
  ]);
  scope.users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(['resources.update']) }));
  await scope.source.getRepository(Form).save({ id: 11, name: 'Safety checklist' });
  scope.events = new EventEmitter2();
  scope.operating = new ResourceOperatingIntervalService(
    scope.source.getRepository(ResourceOperatingInterval),
    {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    } as never,
    scope.events,
  );
  scope.flow = { runFlow: jest.fn(), trackResourceActivity: jest.fn() };
  scope.billing = {
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
  scope.maintenance = {
    hasActiveMaintenance: jest.fn().mockResolvedValue(false),
    canManageMaintenance: jest.fn().mockResolvedValue(false),
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
    scope.maintenance as never,
    scope.events,
    scope.billing as never,
    new ResourceOperatingAttributionService(
      scope.source.getRepository(ResourceOperatingInterval),
      scope.source.getRepository(ResourceUsage),
    ),
    scope.flow as never,
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
}

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { BillingTransaction, Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { BillingTransactionStatus, ResourceType, SupervisionMode } from '@attraccess/application-models';
import { closeTestDataSource, createTestDataSource } from '../../../../test-utils/test-database';
import type { TransactionScope } from '../../../unit-of-work';
import { unitOfWorkFor } from '../../shared-unit-of-work';
import { createOperatingTimelineStore } from '../../operating-intervals/typeorm-operating-timeline.store';
import { ResourceOperatingIntervalService } from '../../../../resources/operating-intervals/resource-operating-interval.service';
import { ResourceOperatingAttributionService } from '../../../../resources/operating-intervals/resource-operating-attribution.service';
import { insertRow } from '../migrated-usage-database.test-fixture';
import type { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from '../../../../resources/usage/lifecycle-persistence/lifecycle.persistence.spec';
import { composeResourceUsageService } from '../../../../resources/usage/sessions/fixtures/compose.test-fixture';
export async function resetTestFixture(scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope) {
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  // The released schema with its triggers and indexes, in a database of its own (dropped by `closeLifecycleFixture`).
  scope.source = await createTestDataSource();
  await scope.source.getRepository(Resource).save({
    name: 'Machine',
    type: ResourceType.Machine,
    allowTakeOver: true,
    supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
  });
  scope.users = await scope.source.getRepository(User).save([
    { username: 'owner', email: 'owner@example.test' },
    { username: 'next-user', email: 'next-user@example.test' },
  ]);
  scope.users.forEach((user) => Object.assign(user, { effectivePermissions: new Set(['resources.update']) }));
  await insertRow(scope.source, 'form', { id: 11, name: 'Safety checklist', resourceId: 1 });
  scope.events = new EventEmitter2();
  scope.operating = new ResourceOperatingIntervalService(
    createOperatingTimelineStore(scope.source),
    {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    } as never,
    scope.events,
  );
  scope.flow = { runFlow: jest.fn(), trackResourceActivity: jest.fn() };
  // The billing stand-in writes through the unit of work the lifecycle hands it, like the real ledger adapter.
  const managerOf = (transaction: TransactionScope) => unitOfWorkFor(scope.source).handleOf(transaction);
  scope.billing = {
    getResourceBillingConfiguration: jest.fn().mockResolvedValue({
      creditsPerUsage: 5,
      creditsPerMinute: 2,
      creditsPerOperatingMinute: 3,
      projectSwitchCharging: 'continue',
    }),
    validateResourceUsageStart: jest.fn().mockResolvedValue(undefined),
    handleResourceUsageStart: jest.fn(
      async (_resourceId: number, session: ResourceUsage, user: User, transaction: TransactionScope) =>
        managerOf(transaction).save(BillingTransaction, {
          resourceUsageId: session.id,
          userId: user.id,
          amount: 0,
          status: BillingTransactionStatus.Pending,
        }),
    ),
    chargeForResourceUsage: jest.fn(async (session: ResourceUsage, unitOfWorkScope: TransactionScope) => {
      const manager = managerOf(unitOfWorkScope);
      const transaction = await manager.findOneByOrFail(BillingTransaction, { resourceUsageId: session.id });
      // The balance follows the completed transaction through the database trigger.
      await manager.update(BillingTransaction, transaction.id, {
        amount: -23,
        status: BillingTransactionStatus.Completed,
      });
      return transaction;
    }),
    handleResourceUsageContinuation: jest.fn(
      async (_resourceId: number, session: ResourceUsage, user: User, transaction: TransactionScope) =>
        managerOf(transaction).save(BillingTransaction, {
          resourceUsageId: session.id,
          userId: user.id,
          amount: 0,
          status: BillingTransactionStatus.Pending,
        }),
    ),
    notifyResourceUsageCharge: jest.fn().mockResolvedValue(undefined),
  };
  scope.maintenance = {
    hasActiveMaintenance: jest.fn().mockResolvedValue(false),
    canManageMaintenance: jest.fn().mockResolvedValue(false),
  };
  scope.health = { isResourceUnhealthy: jest.fn().mockResolvedValue(false) };
  scope.introducers = {
    canMaintain: jest.fn().mockResolvedValue(false),
    isIntroducer: jest.fn().mockResolvedValue(false),
  };
  scope.pluginEvents = { emit: jest.fn() };
  scope.usage = composeResourceUsageService(
    scope.source.getRepository(Resource),
    scope.source.getRepository(ResourceUsage),
    scope.source.getRepository(User),
    {} as never,
    scope.introducers as never,
    {} as never,
    {} as never,
    {} as never,
    scope.maintenance as never,
    scope.events,
    scope.billing as never,
    new ResourceOperatingAttributionService(createOperatingTimelineStore(scope.source)),
    scope.flow as never,
    {
      findOneById: jest.fn(async (_userId: number, projectId: number) => ({ id: projectId })),
    } as never,
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
    scope.health as never,
    scope.pluginEvents as never,
    { getEffectivePermissions: jest.fn(async () => new Set<string>()) } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    null,
  );
}

/** Releases the database of the fixture and drops it. */
export async function closeLifecycleFixture(scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope) {
  scope.usage?.onModuleDestroy();
  await closeTestDataSource(scope.source);
}

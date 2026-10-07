import {
  BillingTransaction,
  BillingTransactionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsPublishesNeitherTheSessionNorItsBillIfPendingTransactionCreationFails(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('publishes neither the session nor its bill if pending transaction creation fails', async () => {
    scope.billing.handleResourceUsageStart.mockImplementation(async (_resourceId, session, user, manager) => {
      await manager.save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
      throw new Error('pending transaction unavailable');
    });

    await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toThrow('pending transaction unavailable');

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.flow.trackResourceActivity).not.toHaveBeenCalled();
  });
}

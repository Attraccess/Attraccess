import { BillingTransaction, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotStartOrRunPhysicalFlowsIfItsPriceSnapshotCannotBePersisted(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('does not start or run physical flows if its price snapshot cannot be persisted', async () => {
    await scope.source.query(`CREATE TRIGGER reject_price_snapshot BEFORE UPDATE OF billingFactor ON resource_usage
      BEGIN SELECT RAISE(ABORT, 'snapshot unavailable'); END`);

    await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toThrow('snapshot unavailable');

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.flow.runFlow).not.toHaveBeenCalled();
  });
}

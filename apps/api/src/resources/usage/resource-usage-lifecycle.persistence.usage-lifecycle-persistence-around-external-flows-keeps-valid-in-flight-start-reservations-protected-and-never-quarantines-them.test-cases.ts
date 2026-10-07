import { ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { recoverOrphanedUsages } from '../../database/resource-usage-integrity';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsKeepsValidInFlightStartReservationsProtectedAndNeverQuarantinesThem(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('keeps valid in-flight start reservations protected and never quarantines them', async () => {
    await scope.migrateIntegrity();
    let enteredFlow!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredFlow = resolve;
    });
    let releaseFlow!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    scope.flow.runFlow.mockImplementation(async () => {
      enteredFlow();
      await released;
    });
    const start = scope.usage.startSession(1, scope.users[0], {});
    await entered;
    try {
      expect(await scope.usage.getActiveSession(1)).toBeNull();
      expect((await scope.usage.getActiveSessions([1])).get(1)).toBeNull();
      expect((await scope.usage.getResourceUsageHistory(1)).total).toBe(0);
      await expect(scope.usage.startSession(1, scope.users[1], { forceTakeOver: true })).rejects.toThrow(
        'A usage lifecycle operation is already in progress',
      );
      await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow(
        'A usage lifecycle operation is already in progress',
      );
      expect(await scope.source.transaction((manager) => recoverOrphanedUsages(manager))).toBe(0);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(1);
      expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(1);
    } finally {
      releaseFlow();
    }
    const session = await start;
    expect((await scope.usage.getActiveSession(1))?.id).toBe(session.id);
    expect(scope.flow.runFlow).toHaveBeenCalledTimes(1);
    expect(scope.billing.handleResourceUsageStart).toHaveBeenCalledTimes(1);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });
}

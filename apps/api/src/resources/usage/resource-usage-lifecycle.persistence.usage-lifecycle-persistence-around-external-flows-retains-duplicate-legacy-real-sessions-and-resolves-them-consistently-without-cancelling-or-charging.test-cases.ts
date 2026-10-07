import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsRetainsDuplicateLegacyRealSessionsAndResolvesThemConsistentlyWithoutCancellingOrCharging(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('retains duplicate legacy real sessions and resolves them consistently without cancelling or charging them', async () => {
    const first = await scope.seedActiveSession();
    const second = await scope.seedActiveSession();
    const before = await scope.publishedState();
    await scope.migrateIntegrity();
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.publishedState()).toEqual(before);
    expect((await scope.usage.getActiveSession(1))?.id).toBe(second.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.id).toBe(second.id);
    await expect(scope.seedActiveSession()).rejects.toThrow('Resource already has an active usage session');
    await scope.usage.endSession(1, scope.users[0], {});
    expect((await scope.usage.getActiveSession(1))?.id).toBe(first.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.id).toBe(first.id);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });
}

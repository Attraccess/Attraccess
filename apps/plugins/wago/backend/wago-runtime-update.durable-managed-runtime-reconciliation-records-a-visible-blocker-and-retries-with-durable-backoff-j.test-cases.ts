import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationRecordsAVisibleBlockerAndRetriesWithDurableBackoffJ(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it.each([
    [{ managed: false }, 'management_required'],
    [{ claimed: false }, 'management_required'],
    [{ compatible: false }, 'incompatible'],
    [{ online: false }, 'offline'],
  ])('records a visible blocker and retries with durable backoff %j', async (overrides, failure) => {
    scope.host.inspect.mockResolvedValue({
      imageId: scope.release('a').imageId,
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
      ...overrides,
    });
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'blocked', failure, retryAt: scope.now + 30_000 });
    expect(await scope.coordinator.reconcile(1)).toBe('deferred');
    expect(scope.host.stage).not.toHaveBeenCalled();
    scope.now += 30_000;
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)?.retryAt).toBe(scope.now + 60_000);
  });
}

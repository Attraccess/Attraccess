import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationRechecksCurrentRuntimeHealthWhenItsBoundedSteadyStateDeadlineExpires(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('rechecks current runtime health when its bounded steady-state deadline expires', async () => {
    await scope.coordinator.reconcile(1);
    scope.host.inspect.mockClear();
    scope.now = scope.rows.get(1)!.retryAt;
    scope.host.inspect.mockResolvedValue({
      imageId: scope.desired.imageId,
      managed: true,
      claimed: true,
      compatible: true,
      online: false,
    });
    expect(await scope.coordinator.reconcile(1)).toBe('settled');
    expect(scope.host.inspect).toHaveBeenCalledTimes(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'blocked', failure: 'offline', retryAt: scope.now + 30_000 });
  });
}

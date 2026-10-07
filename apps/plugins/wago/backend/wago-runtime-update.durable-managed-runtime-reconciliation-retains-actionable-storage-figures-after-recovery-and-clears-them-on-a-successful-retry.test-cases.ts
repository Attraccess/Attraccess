import { RuntimeUpdateError } from './wago-runtime-update';
import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationRetainsActionableStorageFiguresAfterRecoveryAndClearsThemOnASuccessfulRetry(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('retains actionable storage figures after recovery and clears them on a successful retry', async () => {
    const storageDiagnostics = [{ path: '/var/lib', requiredKiB: 180397, availableKiB: 176652 }];
    scope.host.stage.mockRejectedValueOnce(new RuntimeUpdateError('storage', storageDiagnostics));
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'failed', failure: 'storage', storageDiagnostics, token: null });
    await scope.coordinator.reconcile(1, true);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'current', failure: null });
    expect(scope.rows.get(1)?.storageDiagnostics).toBeUndefined();
  });
}

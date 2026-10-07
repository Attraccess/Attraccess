import { WagoRuntimeUpdateCoordinator, RuntimeUpdateError } from './wago-runtime-update';
import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationRetainsTheTokenAcrossFailedRecoveryAndRecoversBeforeStagingOnRestart(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('retains the token across failed recovery and recovers before staging on restart', async () => {
    scope.host.activate.mockRejectedValueOnce(new RuntimeUpdateError('load'));
    scope.host.recover.mockRejectedValueOnce(new Error('raw secret transport output'));
    await scope.coordinator.reconcile(1);
    const token = scope.rows.get(1)?.token;
    expect(scope.rows.get(1)).toMatchObject({ phase: 'recovery_required', failure: 'recovery' });
    expect(JSON.stringify(scope.rows.get(1))).not.toContain('raw secret');
    scope.coordinator.stop();
    scope.coordinator = new WagoRuntimeUpdateCoordinator(
      scope.store,
      async () => scope.desired,
      scope.host,
      scope.audit,
      () => scope.now,
    );
    expect(await scope.coordinator.reconcile(1)).toBe('deferred');
    expect(scope.host.recover).toHaveBeenCalledTimes(1);
    scope.now = scope.rows.get(1)?.retryAt ?? scope.now + 60_000;
    await scope.coordinator.reconcile(1);
    expect(scope.host.recover.mock.calls[1][1]).toBe(token);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'failed', failure: 'interrupted', token: null });
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)?.phase).toBe('current');
  });
}

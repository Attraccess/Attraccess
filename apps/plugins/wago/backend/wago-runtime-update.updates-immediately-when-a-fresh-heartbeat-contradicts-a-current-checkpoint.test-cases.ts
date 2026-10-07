import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";
export function registerUpdatesImmediatelyWhenAFreshHeartbeatContradictsACurrentCheckpoint(scope: DurableManagedRuntimeReconciliationTestScope): void {
it('updates immediately when a fresh heartbeat contradicts a current checkpoint', async () => {
    await scope.coordinator.reconcile(1);
    scope.host.inspect.mockClear();
    await scope.coordinator.reconcile(1, false, scope.release('a').imageId);
    expect(scope.host.inspect).toHaveBeenCalledTimes(1);
    expect(scope.host.activate).toHaveBeenCalledTimes(2);
  });
}

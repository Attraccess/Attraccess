import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationStopsMutationAfterCancellationAndLeavesDurableRecoveryIntent(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('stops mutation after cancellation and leaves durable recovery intent', async () => {
    scope.host.stage.mockImplementation(async () => {
      void scope.coordinator.stop();
    });
    await expect(scope.coordinator.reconcile(1)).rejects.toThrow('interrupted');
    expect(scope.rows.get(1)?.phase).toBe('staging');
    expect(scope.host.activate).not.toHaveBeenCalled();
    expect(scope.host.recover).not.toHaveBeenCalled();
    expect(scope.owners.size).toBe(0);
  });
}

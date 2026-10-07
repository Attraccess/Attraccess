import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationRecoversIfTheDesiredImageChangesDuringS(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it.each(['stage', 'verify'] as const)('recovers if the desired image changes during %s', async (step) => {
    if (step === 'stage')
      scope.host.stage.mockImplementation(async () => {
        scope.desired = scope.release('c');
      });
    else
      scope.host.verify.mockImplementation(async () => {
        scope.desired = scope.release('c');
        return { imageId: scope.release('b').imageId, permanent: true, ready: true, observedAt: ++scope.now };
      });
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'failed', failure: 'release_changed' });
    expect(scope.host.recover).toHaveBeenCalledTimes(1);
    expect(scope.host.accept).not.toHaveBeenCalled();
    if (step === 'stage') expect(scope.host.activate).not.toHaveBeenCalled();
  });
}

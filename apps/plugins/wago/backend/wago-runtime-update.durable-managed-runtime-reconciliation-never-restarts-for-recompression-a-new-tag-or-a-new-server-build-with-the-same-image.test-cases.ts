import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationNeverRestartsForRecompressionANewTagOrANewServerBuildWithTheSameImage(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('never restarts for recompression, a new tag, or a new server build with the same image', async () => {
    scope.desired = { ...scope.release('a'), digest: 'f'.repeat(64), buildId: 'e'.repeat(40) };
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)?.phase).toBe('current');
    expect(scope.host.stage).not.toHaveBeenCalled();
    expect(scope.host.activate).not.toHaveBeenCalled();
    expect(scope.host.verify).toHaveBeenCalledWith(
      1,
      null,
      scope.desired.imageId,
      expect.any(Number),
      expect.any(AbortSignal),
    );
  });
}

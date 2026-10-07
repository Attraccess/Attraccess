import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationStillRequiresReadinessForAnInstalledImageWithTheSameRuntimeVersion(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('still requires readiness for an installed image with the same runtime version', async () => {
    scope.host.inspect.mockResolvedValue({
      imageId: scope.release('a').imageId,
      runtimeVersion: scope.desired.manifest.runtimeVersion,
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    scope.host.verify.mockResolvedValue({
      imageId: scope.release('a').imageId,
      permanent: true,
      ready: false,
      observedAt: ++scope.now,
    });
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'blocked', failure: 'readiness' });
    expect(scope.host.stage).not.toHaveBeenCalled();
  });
}

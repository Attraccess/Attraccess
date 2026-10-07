import { WagoRuntimeUpdateCoordinator } from './wago-runtime-update';
import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationKeepsTheInstalledImageForARebuiltReleaseWithTheSameRuntimeVersionIncludingAfterRestar(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('keeps the installed image for a rebuilt release with the same runtime version, including after restart', async () => {
    const installedImage = scope.release('a').imageId;
    scope.host.inspect.mockResolvedValue({
      imageId: installedImage,
      runtimeVersion: scope.desired.manifest.runtimeVersion,
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    scope.host.verify.mockImplementation(async (_id, _token, imageId) => ({
      imageId,
      permanent: true,
      ready: true,
      observedAt: ++scope.now,
    }));
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'current', currentImageId: installedImage });
    expect(scope.host.stage).not.toHaveBeenCalled();
    expect(scope.host.activate).not.toHaveBeenCalled();
    expect(scope.host.verify).toHaveBeenCalledWith(
      1,
      null,
      installedImage,
      expect.any(Number),
      expect.any(AbortSignal),
    );
    scope.host.inspect.mockClear();
    await scope.coordinator.stop();
    scope.coordinator = new WagoRuntimeUpdateCoordinator(
      scope.store,
      async () => scope.desired,
      scope.host,
      scope.audit,
      () => scope.now,
    );
    await scope.coordinator.reconcile(1, false, installedImage);
    expect(scope.host.inspect).not.toHaveBeenCalled();
    scope.now += 5 * 60_000;
    scope.desired = scope.release('c');
    await scope.coordinator.reconcile(1, false, installedImage);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'current', currentImageId: installedImage });
    expect(scope.host.stage).not.toHaveBeenCalled();
    scope.desired = scope.release('d');
    scope.desired = { ...scope.desired, manifest: { ...scope.desired.manifest, runtimeVersion: '0.2.0' } };
    await scope.coordinator.reconcile(1);
    expect(scope.host.stage).toHaveBeenCalledTimes(1);
    expect(scope.host.activate).toHaveBeenCalledTimes(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'current', currentImageId: scope.desired.imageId });
  });
}

import { RuntimeUpdateError } from './wago-runtime-update';
import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";

export function registerRetainsBeforeAfterVersionsAcrossCompletionAnInspectionFailureAndCurrentImageRechecks(scope: DurableManagedRuntimeReconciliationTestScope): void {
it('retains before/after versions across completion, an inspection failure and current-image rechecks', async () => {
    scope.desired = { ...scope.desired, manifest: { ...scope.desired.manifest, runtimeVersion: '0.2.0' } };
    scope.host.inspect.mockResolvedValue({
      imageId: scope.release('a').imageId,
      runtimeVersion: '0.1.0',
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({
      phase: 'current',
      previousRuntimeVersion: '0.1.0',
      desiredRuntimeVersion: '0.2.0',
      previousImageId: scope.release('a').imageId,
    });
    scope.host.inspect.mockRejectedValueOnce(new RuntimeUpdateError('offline'));
    scope.now = scope.rows.get(1)?.retryAt ?? scope.now;
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({
      phase: 'blocked',
      previousRuntimeVersion: '0.1.0',
      previousImageId: scope.release('a').imageId,
    });
    scope.host.inspect.mockResolvedValue({
      imageId: scope.desired.imageId,
      runtimeVersion: '0.2.0',
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    await scope.coordinator.reconcile(1, true);
    expect(scope.rows.get(1)).toMatchObject({
      phase: 'current',
      previousRuntimeVersion: '0.1.0',
      desiredRuntimeVersion: '0.2.0',
      previousImageId: scope.release('a').imageId,
    });
    scope.desired = scope.release('c');
    scope.desired = { ...scope.desired, manifest: { ...scope.desired.manifest, runtimeVersion: '0.3.0' } };
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({
      phase: 'current',
      previousRuntimeVersion: '0.2.0',
      desiredRuntimeVersion: '0.3.0',
      previousImageId: scope.release('b').imageId,
    });
  });
}

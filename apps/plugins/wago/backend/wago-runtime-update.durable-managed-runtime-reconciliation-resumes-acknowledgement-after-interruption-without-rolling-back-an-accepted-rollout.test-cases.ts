import { WagoRuntimeUpdateCoordinator } from './wago-runtime-update';
import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationResumesAcknowledgementAfterInterruptionWithoutRollingBackAnAcceptedRollout(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('resumes acknowledgement after interruption without rolling back an accepted rollout', async () => {
    scope.host.acknowledge.mockRejectedValueOnce(new Error('disconnected'));
    expect(await scope.coordinator.reconcile(1)).toBe('deferred');
    expect(scope.rows.get(1)?.phase).toBe('current');
    expect(scope.rows.get(1)).toMatchObject({ cleanupAttempt: 1, cleanupRetryAt: scope.now + 30_000 });
    scope.coordinator.stop();
    scope.coordinator = new WagoRuntimeUpdateCoordinator(
      scope.store,
      async () => scope.desired,
      scope.host,
      scope.audit,
      () => scope.now,
    );
    expect(await scope.coordinator.reconcile(1)).toBe('deferred');
    expect(scope.host.acknowledge).toHaveBeenCalledTimes(1);
    scope.now += 30_000;
    scope.host.inspect.mockResolvedValue({
      imageId: scope.desired.imageId,
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    await scope.coordinator.reconcile(1);
    expect(scope.host.recover).not.toHaveBeenCalled();
    expect(scope.host.activate).toHaveBeenCalledTimes(1);
    expect(scope.rows.get(1)?.token).toBeNull();
    expect(scope.rows.get(1)).toMatchObject({ cleanupAttempt: 0, cleanupRetryAt: 0 });
  });
}

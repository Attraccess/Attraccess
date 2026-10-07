import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleProcessesANewConnectionImmediatelyInsideTheFleetScanCooldown(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('processes a new connection immediately inside the fleet scan cooldown', async () => {
    const internals = scope.service as unknown as {
      nextScanAt: number;
      scanning: boolean;
      reconcileConnection(id: number): Promise<void>;
    };
    while (internals.scanning) await new Promise(setImmediate);
    internals.nextScanAt = Date.now() + 30_000;
    const reconcile = jest.spyOn(internals, 'reconcileConnection').mockResolvedValue(undefined);
    const handler = jest.mocked(scope.service['wago'].registerRuntimeStatusHandler).mock.calls[0][0];
    handler(1, {
      imageId: scope.artifact.imageId,
      streamId: '00000000-0000-4000-8000-000000000001',
      sequence: 1,
      timestamp: Date.now(),
      receivedAt: Date.now(),
    });
    await new Promise(setImmediate);
    expect(reconcile).toHaveBeenCalledWith(1);
  });
}

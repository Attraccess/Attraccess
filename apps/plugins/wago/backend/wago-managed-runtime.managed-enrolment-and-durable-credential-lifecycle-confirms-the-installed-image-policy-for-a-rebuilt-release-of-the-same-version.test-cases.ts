import { WagoController } from './wago-controller.entity';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleConfirmsTheInstalledImagePolicyForARebuiltReleaseOfTheSameVersion(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('confirms the installed image policy for a rebuilt release of the same version', async () => {
    const imageId = `sha256:${'0'.repeat(64)}`;
    const timestamp = new Date().toISOString();
    await scope.db.getRepository(WagoController).save(
      Object.assign(new WagoController(), {
        id: 1,
        hardwareId: 'cc100-1',
        trustState: 'claimed',
        pairingCodeHash: 'fixture',
        protocolVersion: '1.0.0',
        runtimeVersion: scope.artifact.manifest.runtimeVersion,
        capabilities: '[]',
        lastSeenAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    scope.service['heartbeats'].set(1, {
      imageId,
      runtimeVersion: scope.artifact.manifest.runtimeVersion,
      streamId: '00000000-0000-4000-8000-000000000001',
      timestamp: Date.now(),
      receivedAt: Date.now(),
    });
    const policy = jest.fn();
    scope.service['wago'].setRuntimePolicy = policy;
    await scope.service['refreshRuntimePolicy'](1);
    expect(policy).toHaveBeenCalledWith(1, imageId, imageId, undefined);
    expect(await scope.service.status(1)).toMatchObject({
      runtime: {
        runningImageId: imageId,
        desiredImageId: imageId,
        runningVersion: scope.artifact.manifest.runtimeVersion,
        desiredVersion: scope.artifact.manifest.runtimeVersion,
      },
    });
  });
}

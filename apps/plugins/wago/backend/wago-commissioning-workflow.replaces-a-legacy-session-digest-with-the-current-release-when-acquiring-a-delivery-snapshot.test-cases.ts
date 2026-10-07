import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerReplacesALegacySessionDigestWithTheCurrentReleaseWhenAcquiringADeliverySnapshot(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('replaces a legacy session digest with the current release when acquiring a delivery snapshot', async () => {
    const currentDigest = 'b'.repeat(64);
    scope.artifacts.acquire.mockResolvedValue({ digest: currentDigest, bytes: 512, directory: scope.directory });
    const bundle = await scope.service['acquireRuntimeBundle'](scope.session);
    expect(scope.artifacts.acquire).toHaveBeenCalledWith();
    expect(bundle.digest).toBe(currentDigest);
    expect(
      (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id })).runtimeArtifactDigest,
    ).toBe(currentDigest);
  });
}

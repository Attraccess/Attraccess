import { join } from 'node:path';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerDeliversTheCurrentBuildToALegacySessionWhoseStoredDigestBelongsToAnOlderBuild(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('delivers the current build to a legacy session whose stored digest belongs to an older build', async () => {
    const currentDigest = 'b'.repeat(64);
    const currentPath = join(scope.directory, 'current-build.tar');
    scope.artifacts.current.mockResolvedValue({ digest: currentDigest });
    scope.artifacts.acquire.mockResolvedValue({
      digest: currentDigest,
      bytes: 512,
      directory: scope.directory,
      path: currentPath,
      image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${currentDigest}`,
    });
    jest
      .spyOn(scope.service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? scope.clockOutput() : '') as never);
    const copy = jest.spyOn(scope.service as never, 'copyTo').mockResolvedValue(undefined as never);
    const result = await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal);
    expect(result.state).toBe('awaiting_discovery');
    expect(copy.mock.calls[0]).toContain(currentPath);
    expect(scope.artifacts.acquire).toHaveBeenCalledWith();
    expect(
      (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id })).runtimeArtifactDigest,
    ).toBe(currentDigest);
  });
}

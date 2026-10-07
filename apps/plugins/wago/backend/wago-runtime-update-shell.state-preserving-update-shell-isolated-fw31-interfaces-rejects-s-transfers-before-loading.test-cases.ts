import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsSTransfersBeforeLoading(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it.each(['truncated', 'oversized', 'checksum'])('rejects %s transfers before loading', (fault) => {
    const input =
      fault === 'truncated'
        ? scope.bundle.subarray(0, 1024)
        : fault === 'oversized'
          ? Buffer.concat([scope.bundle, Buffer.alloc(512)])
          : Buffer.alloc(scope.bundle.length);
    expect(scope.stage('', input).status).not.toBe(0);
    expect(scope.fixture.read('docker.log')).not.toContain('load -i');
    expect(scope.fixture.containers()[0].running).toBe(true);
    scope.success(scope.rollback());
    scope.success(scope.acknowledge());
  });
}

import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesLeavesTheCurrentRuntimeUntouchedOnStagingSFailure(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it.each(['load', 'storage', 'inspect-image'])(
    'leaves the current runtime untouched on staging %s failure',
    (fault) => {
      expect(scope.stage(fault).status).not.toBe(0);
      expect(scope.fixture.containers()[0]).toMatchObject({ id: 'old-id', running: true });
      expect(scope.fixture.read(scope.data + '/credentials.json')).toBe('permanent-credentials');
      expect(scope.fixture.read('docker.log')).not.toMatch(/^stop /m);
      scope.success(scope.rollback());
      scope.success(scope.acknowledge());
    },
  );
}

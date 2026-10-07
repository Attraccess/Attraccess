import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesRestoresThePriorContainerAndItsStoppedStateCheckpointAfterReadinessFailureOrReboot(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('restores the prior container and its stopped-state checkpoint after readiness failure or reboot', () => {
    scope.success(scope.stage());
    scope.success(scope.activate());
    scope.fixture.file(scope.data + '/state.json', 'incompatible-new-state');
    // The transaction is entirely on disk; a fresh recovery invocation needs no
    // live connection, bootstrap password or coordinator memory.
    scope.success(scope.rollback());
    scope.success(scope.rollback());
    expect(scope.fixture.read('etc/rc.d/S99_zz_attraccess_wago')).toContain('previous-build-hook');
    expect(scope.fixture.read(scope.data + '/state.json')).toBe('accepted-configuration');
    expect(scope.fixture.read(scope.data + '/credentials.json')).toBe('permanent-credentials');
    expect(scope.fixture.containers()).toEqual([
      expect.objectContaining({ id: 'old-id', name: 'attraccess-wago', running: true }),
    ]);
    scope.success(scope.acknowledge());
  });
}

import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesRecoversAFailedOrInterruptedSWithoutReenrollment(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it.each(['start', 'kill', 'supervisor-launch-failed'])(
    'recovers a failed or interrupted %s without reenrollment',
    (fault) => {
      scope.success(scope.stage());
      const result = scope.activate(fault);
      expect(result.status).not.toBe(0);
      scope.success(scope.rollback());
      expect(scope.fixture.containers()).toEqual([expect.objectContaining({ id: 'old-id', running: true })]);
      expect(scope.fixture.read(scope.data + '/credentials.json')).toBe('permanent-credentials');
    },
  );
}

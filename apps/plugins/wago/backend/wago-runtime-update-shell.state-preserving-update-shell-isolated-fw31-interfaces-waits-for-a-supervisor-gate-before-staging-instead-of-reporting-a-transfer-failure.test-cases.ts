import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesWaitsForASupervisorGateBeforeStagingInsteadOfReportingATransferFailure(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('waits for a supervisor gate before staging instead of reporting a transfer failure', () => {
    scope.success(scope.stage('supervisor-lock-held'));
    expect(scope.fixture.read(scope.tx + '/phase')).toBe('staged\n');
    expect(scope.fixture.containers()[0]).toMatchObject({
      name: 'attraccess-wago',
      running: true,
      imageId: scope.previousImageId,
    });
    expect(scope.fixture.read(scope.data + '/credentials.json')).toBe('permanent-credentials');
  });
}

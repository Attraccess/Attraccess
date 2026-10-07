import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesReclaimsAFailedLoadedCandidateAfterRollbackAcknowledgement(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('reclaims a failed loaded candidate after rollback acknowledgement', () => {
    scope.success(scope.stage());
    scope.success(scope.activate());
    scope.success(scope.rollback());
    expect(JSON.parse(scope.fixture.read('images.json'))).toContain(scope.imageId);
    scope.success(scope.acknowledge());
    expect(JSON.parse(scope.fixture.read('images.json'))).toEqual([scope.previousImageId]);
    expect(scope.fixture.containers()[0]).toMatchObject({ running: true, imageId: scope.previousImageId });
  });
}

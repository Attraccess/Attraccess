import { runtimeUpdateAcceptScript } from './wago-runtime-update-shell';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesReclaimsTheRetiredImageOnlyAfterAcceptanceIsDurablyAcknowledged(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('reclaims the retired image only after acceptance is durably acknowledged', () => {
    const unrelatedImage = `sha256:${'e'.repeat(64)}`;
    scope.fixture.file('images.json', JSON.stringify([scope.previousImageId, unrelatedImage]));
    scope.success(scope.stage());
    scope.success(scope.activate());
    scope.success(scope.fixture.run(runtimeUpdateAcceptScript(scope.token, scope.profile, scope.fixture.root)));
    expect(JSON.parse(scope.fixture.read('images.json'))).toContain(scope.previousImageId);
    scope.success(scope.acknowledge());
    scope.success(scope.acknowledge());
    expect(JSON.parse(scope.fixture.read('images.json'))).toEqual([unrelatedImage, scope.imageId]);
    expect(scope.fixture.containers()[0]).toMatchObject({ running: true, imageId: scope.imageId });
  });
}

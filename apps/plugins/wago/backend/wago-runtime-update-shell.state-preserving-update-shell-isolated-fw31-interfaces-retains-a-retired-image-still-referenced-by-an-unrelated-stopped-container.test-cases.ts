import { runtimeUpdateAcceptScript } from './wago-runtime-update-shell';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesRetainsARetiredImageStillReferencedByAnUnrelatedStoppedContainer(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('retains a retired image still referenced by an unrelated stopped container', () => {
    scope.success(scope.stage());
    scope.success(scope.activate());
    scope.fixture.setContainers([
      ...scope.fixture.containers(),
      {
        id: 'unrelated',
        name: 'user-workload',
        running: false,
        restart: 'no',
        imageId: scope.previousImageId,
      },
    ]);
    scope.success(scope.fixture.run(runtimeUpdateAcceptScript(scope.token, scope.profile, scope.fixture.root)));
    scope.success(scope.acknowledge());
    expect(JSON.parse(scope.fixture.read('images.json'))).toContain(scope.previousImageId);
    expect(scope.fixture.containers()).toHaveLength(2);
    expect(scope.fixture.read('docker.log')).not.toContain(`image rm ${scope.previousImageId}`);
  });
}

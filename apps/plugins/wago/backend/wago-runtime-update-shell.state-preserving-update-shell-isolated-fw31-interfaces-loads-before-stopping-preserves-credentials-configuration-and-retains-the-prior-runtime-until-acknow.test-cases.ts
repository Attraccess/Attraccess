import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeUpdateAcceptScript } from './wago-runtime-update-shell';
import { wagoRuntimeBootScript } from './wago-hardware-deployment';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesLoadsBeforeStoppingPreservesCredentialsConfigurationAndRetainsThePriorRuntimeUntilAcknow(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('loads before stopping, preserves credentials/configuration, and retains the prior runtime until acknowledgement', () => {
    scope.success(scope.stage());
    expect(existsSync(join(scope.fixture.root, scope.tx, 'image.tar'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, scope.tx, 'bundle.tar'))).toBe(false);
    expect(scope.fixture.read('etc/rc.d/S99_zz_attraccess_wago')).toContain('previous-build-hook');
    expect(scope.fixture.containers()[0].running).toBe(true);
    expect(scope.fixture.read(scope.tx + '/phase')).toBe('staged\n');
    scope.success(scope.activate());
    expect(scope.fixture.read('etc/rc.d/S99_zz_attraccess_wago')).toBe(
      wagoRuntimeBootScript(scope.fixture.root, scope.profile),
    );
    expect(scope.fixture.read(scope.data + '/credentials.json')).toBe('permanent-credentials');
    expect(scope.fixture.read(scope.data + '/state.json')).toBe('accepted-configuration');
    expect(scope.fixture.read(scope.config + '/runtime.env')).toContain('permanent-fixture-secret');
    expect(scope.fixture.containers()).toEqual([
      expect.objectContaining({ id: 'old-id', name: 'attraccess-wago.previous', running: false }),
      expect.objectContaining({ name: 'attraccess-wago', running: true, imageId: scope.imageId }),
    ]);
    expect(scope.fixture.read('docker.log')).toContain(`--env WAGO_RUNTIME_IMAGE_ID=${scope.imageId}`);
    scope.success(scope.fixture.run(runtimeUpdateAcceptScript(scope.token, scope.profile, scope.fixture.root)));
    expect(existsSync(join(scope.fixture.root, scope.tx, 'state.previous'))).toBe(true);
    scope.success(scope.acknowledge());
    scope.success(scope.acknowledge());
    expect(scope.fixture.containers()).toHaveLength(1);
    expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
  });
}

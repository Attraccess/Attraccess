import { runtimeUpdateActivateScript } from './wago-runtime-update-shell';
import { runtimeBundleInstallScript } from './wago-runtime-install';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesSerializesStagingAgainstDestructiveCommissioningAndRejectsAForeignUpdateToken(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('serializes staging against destructive commissioning and rejects a foreign update token', () => {
    scope.success(scope.stage());
    const commissioning = scope.fixture.run(runtimeBundleInstallScript(scope.image, scope.fixture.root));
    expect(commissioning.status).not.toBe(0);
    expect(commissioning.stderr).toContain('Managed runtime update');
    const foreign = scope.fixture.run(runtimeUpdateActivateScript('f'.repeat(32), scope.profile, scope.fixture.root));
    expect(foreign.status).not.toBe(0);
    expect(foreign.stderr).toContain('Foreign update');
    expect(scope.fixture.containers()[0].running).toBe(true);
  });
}

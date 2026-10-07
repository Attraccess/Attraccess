import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesChecksDockerIdentityPlatformRatherThanTrustingTheTarReference(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('checks Docker identity/platform rather than trusting the tar reference', () => {
    scope.fixture.file('loaded-image-id', `sha256:${'d'.repeat(64)}`);
    expect(scope.stage().status).not.toBe(0);
    expect(scope.fixture.containers()[0].running).toBe(true);
  });
}

import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerRequiresLiteralInstallationConsentP(scope: WagoCommissioningServiceTestScope): void {
it.each([undefined, false, 'true', 1])('requires literal installation consent (%p)', async (confirmInstall) => {
    const { service, inspect, sudo, wago } = scope.securityHarness();
    await expect(
      service.deliver(1, { confirmInstall, temporarySsh: { username: 'root', password: 'explicit' } } as never),
    ).rejects.toThrow('explicit installation confirmation');
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });
}

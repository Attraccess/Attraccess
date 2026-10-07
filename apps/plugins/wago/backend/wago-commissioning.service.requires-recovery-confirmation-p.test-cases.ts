import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerRequiresRecoveryConfirmationP(scope: WagoCommissioningServiceTestScope): void {
it.each([false, undefined])('requires recovery confirmation %p', async (confirmInstall) => {
    const { service, sudo } = scope.securityHarness({ state: 'delivery_failed' });
    await expect(
      service.recover(1, { confirmInstall, temporarySsh: { username: 'root', password: 'secret' } }),
    ).rejects.toThrow('explicit installation confirmation');
    expect(sudo).not.toHaveBeenCalled();
  });
}

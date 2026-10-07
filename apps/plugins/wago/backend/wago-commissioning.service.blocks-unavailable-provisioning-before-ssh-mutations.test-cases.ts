import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerBlocksUnavailableProvisioningBeforeSshMutations(scope: WagoCommissioningServiceTestScope): void {
it('blocks unavailable provisioning before SSH mutations', async () => {
    const { service, context, sudo, inspect, wago } = scope.securityHarness({}, scope.configuredService());
    context.getMqttCredentialProvisioning().availableProviders.mockResolvedValue([]);
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'provided' },
    });
    expect(result.state).toBe('delivery_failed');
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });
}

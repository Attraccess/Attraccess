import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerExplicitlyRecoversWithoutNewArtifactsBrokerProvisioningOrAcceptance(scope: WagoCommissioningServiceTestScope): void {
it('explicitly recovers without new artifacts, broker provisioning or acceptance', async () => {
    const { service, wago } = scope.securityHarness({ state: 'awaiting_verification', pairingCode: null });
    const script = jest.fn().mockResolvedValue('');
    service['sudoRunScript'] = script;
    const result = await service.recover(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'secret' },
    });
    expect(result.progressStep).toBe('Runtime installation cleaned up');
    expect(result.state).toBe('revoked');
    expect(result.progressDetail).toContain('new commissioning session');
    expect(script.mock.calls[0][3]).toContain('timeout -k 5 310 flock 9');
    expect(script.mock.calls[0][3]).not.toContain('touch "$tx/accepting"');
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });
}

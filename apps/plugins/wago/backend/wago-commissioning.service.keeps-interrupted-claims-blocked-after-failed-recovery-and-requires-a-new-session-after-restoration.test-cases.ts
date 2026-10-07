import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerKeepsInterruptedClaimsBlockedAfterFailedRecoveryAndRequiresANewSessionAfterRestoration(scope: WagoCommissioningServiceTestScope): void {
it('keeps interrupted claims blocked after failed recovery and requires a new session after restoration', async () => {
    const { service, session } = scope.securityHarness({ state: 'claim_interrupted', enrollmentId: 7 });
    service['sudoRunScript'] = jest.fn().mockRejectedValueOnce(new Error('SSH unavailable')).mockResolvedValue('');
    const input = { confirmInstall: true, temporarySsh: { username: 'root', password: 'fixture' } };
    await service.recover(1, input);
    expect(session.state).toBe('claim_interrupted');
    await expect(service.deliver(1, input)).rejects.toThrow('cannot be delivered');
    await service.recover(1, input);
    expect(session.state).toBe('revoked');
    expect(session.pairingCode).toBeNull();
  });
}

import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerRejectsALegacyVerifierOnDirectDiscoveryWithoutPassingItToClaim(scope: WagoCommissioningServiceTestScope): void {
it('rejects a legacy verifier on direct discovery without passing it to claim', async () => {
    const { service, session, wago } = scope.securityHarness({
      state: 'awaiting_discovery',
      enrollmentId: 7,
      pairingCode: 'plaintext',
    });
    await service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    expect(wago.claim).not.toHaveBeenCalled();
    expect(session.state).toBe('revoked');
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7, expect.any(Function));
  });
}

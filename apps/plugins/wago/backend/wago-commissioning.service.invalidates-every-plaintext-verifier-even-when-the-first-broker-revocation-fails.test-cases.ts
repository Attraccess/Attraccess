import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerInvalidatesEveryPlaintextVerifierEvenWhenTheFirstBrokerRevocationFails(scope: WagoCommissioningServiceTestScope): void {
it('invalidates every plaintext verifier even when the first broker revocation fails', async () => {
    const { service, session, repository, wago } = scope.securityHarness({ pairingCode: 'legacy', enrollmentId: 7 });
    const later = { ...session, id: 2, enrollmentId: 8 };
    repository.find.mockResolvedValue([session, later]);
    repository.findOneBy.mockImplementation(async ({ id }) => (id === later.id ? later : session));
    wago.revokeEnrollmentById.mockRejectedValueOnce(new Error('broker unavailable'));
    await service.onApplicationBootstrap();
    expect(session).toMatchObject({ state: 'revoked', pairingCode: null, enrollmentId: 7 });
    expect(later).toMatchObject({ state: 'revoked', pairingCode: null, enrollmentId: null });
    expect(later.progressStep).toBe('Commissioning session revoked');
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(8, expect.any(Function));
    expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
  });
}

import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerRevokesAndClearsLegacyPlaintextBeforeRegisteringDiscoveryUsingBoundedPages(scope: WagoCommissioningServiceTestScope): void {
it('revokes and clears legacy plaintext before registering discovery, using bounded pages', async () => {
    const { service, session, repository, wago, context } = scope.securityHarness({
      id: 101,
      state: 'awaiting_discovery',
      enrollmentId: 7,
      pairingCode: 'legacy-secret',
    });
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ ...session, id: i + 1 }));
    repository.findOneBy.mockImplementation(async ({ id }) =>
      id === session.id ? session : firstPage.find((entry) => entry.id === id),
    );
    repository.find.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([session]);
    wago.revokeEnrollmentById.mockImplementation(async () => {
      expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
    });
    await service.onApplicationBootstrap();
    expect(repository.find).toHaveBeenNthCalledWith(1, { order: { id: 'ASC' }, take: 100, skip: 0 });
    expect(repository.find).toHaveBeenNthCalledWith(2, { order: { id: 'ASC' }, take: 100, skip: 100 });
    expect(session.state).toBe('revoked');
    expect(session.pairingCode).toBeNull();
    expect(firstPage.every((entry) => entry.pairingCode === null && entry.state === 'revoked')).toBe(true);
    expect(wago.revokeEnrollmentById).toHaveBeenCalledTimes(101);
    expect(context.secrets.decrypt).not.toHaveBeenCalled();
    expect(wago.registerCommissioningDiscoveryHandler).toHaveBeenCalledTimes(1);
  });
}

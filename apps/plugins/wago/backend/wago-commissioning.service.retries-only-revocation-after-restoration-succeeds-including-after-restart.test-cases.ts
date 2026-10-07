import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerRetriesOnlyRevocationAfterRestorationSucceedsIncludingAfterRestart(scope: WagoCommissioningServiceTestScope): void {
it('retries only revocation after restoration succeeds, including after restart', async () => {
    const { service, session, repository, wago } = scope.securityHarness({
      state: 'awaiting_verification',
      pairingCode: null,
      enrollmentId: 7,
    });
    const remote = jest.fn().mockResolvedValue('');
    service['sudoRunScript'] = remote;
    wago.revokeEnrollmentById.mockRejectedValueOnce(new Error('Broker unavailable')).mockResolvedValue(undefined);
    const input = { confirmInstall: true, temporarySsh: { username: 'root', password: 'fixture' } };
    await service.recover(1, input);
    expect(session.state).toBe('recovery_revocation_pending');
    repository.find.mockResolvedValue([session]);
    await service.onApplicationBootstrap();
    expect(session.state).toBe('recovery_revocation_pending');
    await service.recover(1, input);
    expect(remote).toHaveBeenCalledTimes(3);
    expect(wago.revokeEnrollmentById).toHaveBeenCalledTimes(2);
    expect(session.state).toBe('revoked');
  });
}

import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerReportsRecoveryFailureSafelyAndDoesNotRevokeCredentialsWhenRemoteRecoveryFails(scope: WagoCommissioningServiceTestScope): void {
it('reports recovery failure safely and does not revoke credentials when remote recovery fails', async () => {
    const { service, wago } = scope.securityHarness({ state: 'delivery_failed', enrollmentId: 7 });
    service['sudoRunScript'] = jest.fn().mockRejectedValue(new Error('secret remote output'));
    const result = await service.recover(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'secret' },
    });
    expect(result.progressStep).toBe('Recovery requires attention');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
  });
}

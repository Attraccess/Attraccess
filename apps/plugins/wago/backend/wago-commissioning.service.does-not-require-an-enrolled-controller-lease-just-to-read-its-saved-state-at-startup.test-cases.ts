import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerDoesNotRequireAnEnrolledControllerLeaseJustToReadItsSavedStateAtStartup(scope: WagoCommissioningServiceTestScope): void {
it('does not require an enrolled controller lease just to read its saved state at startup', async () => {
    const { service, session, repository } = scope.securityHarness({
      state: 'awaiting_verification',
      pairingCode: null,
      dockerProvisionState: 'started',
    });
    repository.find.mockResolvedValue([session]);
    const lock = jest.fn().mockRejectedValue(new Error('Background check holds lease'));
    service['withControllerLock'] = lock;
    await expect(service['recoverSessions']()).resolves.toBeUndefined();
    expect(lock).not.toHaveBeenCalled();
  });
}

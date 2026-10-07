import { WagoRecoveryError } from './wago-recovery-error';
import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerReportsBoundedLockContentionAsCleanupGuidanceInsteadOfACredentialFailure(scope: WagoCommissioningServiceTestScope): void {
it('reports bounded lock contention as cleanup guidance instead of a credential failure', async () => {
    const { service, wago } = scope.securityHarness({ state: 'delivery_failed', enrollmentId: 7 });
    service['sudoRunScript'] = jest.fn().mockRejectedValue(new WagoRecoveryError('busy'));
    const result = await service.recover(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'secret' },
    });
    expect(result.failureReason).toContain('runtime monitor');
    expect(result.failureReason).toContain('310 seconds');
    expect(result.failureReason).toContain('Do not delete the lock file');
    expect(result.state).toBe('delivery_failed');
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
  });
}

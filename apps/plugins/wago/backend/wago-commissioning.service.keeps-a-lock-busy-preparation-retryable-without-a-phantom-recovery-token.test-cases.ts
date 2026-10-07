import {
  WagoControllerLockError,
} from './wago-commissioning.service';
import { fw31IdentityOutput } from './fixtures/fw31-identity';
import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";

export function registerKeepsALockBusyPreparationRetryableWithoutAPhantomRecoveryToken(scope: WagoCommissioningServiceTestScope): void {
it('keeps a lock-busy preparation retryable without a phantom recovery token', async () => {
    const { service, session, wago, inspect } = scope.securityHarness({ firmwareBaseline: '31', deliveryToken: null });
    inspect.mockResolvedValue({ firmware: fw31IdentityOutput(), codesys: 'inactive' });
    service['requireRuntimeArtifact'] = jest.fn().mockResolvedValue(undefined);
    service['acquireRuntimeBundle'] = jest
      .fn()
      .mockResolvedValue({ bytes: 512, path: '/mock/runtime.tar', directory: '/mock/staging' });
    service['sudoRunScript'] = jest.fn().mockResolvedValueOnce('').mockRejectedValueOnce(new WagoControllerLockError());
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'fixture-only' },
    });
    expect(result.state).toBe('delivery_failed');
    expect(result.failureReason).toContain('Retry installation shortly; no preparation was started.');
    expect(result.progressDetail).toContain('No preparation started');
    expect(session.dockerProvisionToken).toBeNull();
    expect(session.dockerProvisionState).toBeNull();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });
}

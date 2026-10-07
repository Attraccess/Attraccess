import {
  WagoStorageCapacityError
} from './wago-commissioning.service';
import { fw31IdentityOutput } from './fixtures/fw31-identity';
import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";

export function registerReportsStagingCapacityFailuresWithoutSuggestingControllerPreparationCleanup(scope: WagoCommissioningServiceTestScope): void {
it('reports staging capacity failures without suggesting controller preparation cleanup', async () => {
    const { service, session, wago, inspect } = scope.securityHarness({ firmwareBaseline: '31', deliveryToken: null });
    inspect.mockResolvedValue({ firmware: fw31IdentityOutput(), codesys: 'inactive' });
    service['requireRuntimeArtifact'] = jest.fn().mockResolvedValue(undefined);
    service['acquireRuntimeBundle'] = jest
      .fn()
      .mockResolvedValue({ bytes: 512, path: '/mock/runtime.tar', directory: '/mock/staging' });
    service['sudoRunScript'] = jest.fn().mockRejectedValueOnce(new WagoStorageCapacityError());
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'fixture-only' },
    });
    expect(result.state).toBe('delivery_failed');
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(service['sudoRunScript']).toHaveBeenCalledTimes(1);
    expect(result.failureReason).toBe('Not enough free storage on the CC100 for this runtime. Free space and retry.');
    expect(result.progressDetail).toBe('Free space on the CC100, then retry installation.');
    expect(session.dockerProvisionToken).toBeFalsy();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
  });
}

import { fw31IdentityOutput } from './fixtures/fw31-identity';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoManagedProvisioningError } from './wago-managed-provisioning-error';
import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerChecksFw31ManagementToolsBeforePreparationAndRetainsTheActionableReason(scope: WagoCommissioningServiceTestScope): void {
it('checks FW31 management tools before preparation and retains the actionable reason', async () => {
    const { service, session, wago, inspect } = scope.securityHarness({ firmwareBaseline: '31', deliveryToken: null });
    const locks = [
      jest.spyOn(WagoDeviceOperations.prototype, 'acquire').mockResolvedValue(true),
      jest.spyOn(WagoDeviceOperations.prototype, 'assertOwned').mockResolvedValue(undefined),
      jest.spyOn(WagoDeviceOperations.prototype, 'release').mockResolvedValue(undefined),
    ];
    inspect.mockResolvedValue({ firmware: fw31IdentityOutput(), codesys: 'inactive' });
    Object.assign(service, {
      managedRuntime: { hasAccess: async () => false, assertNetworkSettled: async () => undefined },
    });
    service['requireRuntimeArtifact'] = jest.fn().mockResolvedValue(undefined);
    service['acquireRuntimeBundle'] = jest
      .fn()
      .mockResolvedValue({ bytes: 512, path: '/mock/runtime.tar', directory: '/mock/staging' });
    service['sudoRunScript'] = jest.fn().mockRejectedValueOnce(new WagoManagedProvisioningError('tools'));
    service['prepareController'] = jest.fn();
    try {
      const result = await service.deliver(1, {
        confirmInstall: true,
        temporarySsh: { username: 'root', password: 'fixture-only' },
      });
      expect(result.failureReason).toContain('Check that passwd, useradd, groupadd and sudo are installed.');
      expect(result.progressDetail).toContain('No controller preparation started');
      expect(service['prepareController']).not.toHaveBeenCalled();
      expect(service['sudoRunScript']).toHaveBeenCalledTimes(1);
      expect(wago.createEnrollment).not.toHaveBeenCalled();
      expect(session.dockerProvisionToken).toBeFalsy();
    } finally {
      for (const lock of locks) lock.mockRestore();
    }
  });
}

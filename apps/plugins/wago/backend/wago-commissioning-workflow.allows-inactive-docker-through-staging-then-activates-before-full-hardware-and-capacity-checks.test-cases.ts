import { runtimeBundlePreflightScript, runtimeBundleStagingCapacityPreflightScript } from './wago-runtime-install';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerAllowsInactiveDockerThroughStagingThenActivatesBeforeFullHardwareAndCapacityChecks(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('allows inactive Docker through staging, then activates before full hardware and capacity checks', async () => {
    let active = false;
    const order: string[] = [];
    scope.wago.createEnrollment.mockClear();
    jest.spyOn(scope.service as never, 'sudoRunScript').mockImplementation((async (
      _host,
      _pin,
      _credential,
      script: string,
    ) => {
      if (script === runtimeBundleStagingCapacityPreflightScript(512)) {
        expect(active).toBe(false);
        expect(script).not.toContain('docker info');
        order.push('staging');
      } else if (script.includes('runtime-version=0')) {
        expect(order).toEqual(['staging']);
        active = true;
        order.push('prepare');
      } else if (script === runtimeBundlePreflightScript(512)) {
        expect(active).toBe(true);
        expect(script).toContain('codesys-active');
        order.push('full');
      } else if (script.includes("printf 'epoch=")) {
        expect(order).toEqual(['staging', 'prepare', 'full']);
        return scope.clockOutput();
      }
      return '';
    }) as never);
    jest.spyOn(scope.service as never, 'copyTo').mockResolvedValue(undefined as never);
    const result = await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal);
    expect(result.state).toBe('awaiting_discovery');
    expect(order).toEqual(['staging', 'prepare', 'full']);
    expect(scope.artifacts.acquire).toHaveBeenCalledTimes(1);
    expect(scope.wago.createEnrollment).toHaveBeenCalledTimes(1);
  });
}

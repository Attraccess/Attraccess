import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleStartsBackgroundReconciliationOnBootstrapWithoutAdditionalConfiguration(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('starts background reconciliation on bootstrap without additional configuration', async () => {
    const restarted = new WagoManagedRuntimeService(
      scope.context,
      { registerRuntimeStatusHandler: jest.fn() } as unknown as WagoService,
      {} as WagoRuntimeArtifactsService,
      {} as WagoCommissioningReadiness,
    );
    const scan = jest.spyOn(restarted as unknown as { scan(): Promise<void> }, 'scan').mockResolvedValue(undefined);
    try {
      restarted.onApplicationBootstrap();
      await new Promise(setImmediate);
      expect(scan).toHaveBeenCalledTimes(1);
    } finally {
      await restarted.onModuleDestroy();
    }
  });
}

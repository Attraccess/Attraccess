import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerReleasesASettledLocalRejectionSoACorrectedRequestCanRetry(scope: WagoCommissioningServiceTestScope): void {
it('releases a settled local rejection so a corrected request can retry', async () => {
    const { service } = scope.securityHarness();
    await expect(
      service['withControllerLock'](1, async () => {
        throw new Error('qualification_required');
      }),
    ).rejects.toThrow('qualification_required');
    await expect(service['withControllerLock'](1, async () => 'retry')).resolves.toBe('retry');
  });
}

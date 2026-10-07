import { WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleSharesDeviceOwnershipAcrossProcessesAndFencesExpiredOwnersWithoutReleasingASuccessor(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('shares device ownership across processes and fences expired owners without releasing a successor', async () => {
    const first = new WagoDeviceOperations(scope.db.getRepository(WagoDeviceOperation));
    const second = new WagoDeviceOperations(scope.db.getRepository(WagoDeviceOperation));
    expect(await first.acquire('device-a', 'commissioning', 100, 200)).toBe(true);
    expect(await second.acquire('device-a', 'update', 150, 300)).toBe(false);
    expect(await second.acquire('device-b', 'update-b', 150, 300)).toBe(true);
    await expect(first.assertOwned('device-a', 'commissioning', 201)).rejects.toThrow('ownership');
    expect(await second.acquire('device-a', 'successor', 201, 400)).toBe(true);
    await first.release('device-a', 'commissioning');
    expect(await first.acquire('device-a', 'third', 202, 500)).toBe(false);
  });
}

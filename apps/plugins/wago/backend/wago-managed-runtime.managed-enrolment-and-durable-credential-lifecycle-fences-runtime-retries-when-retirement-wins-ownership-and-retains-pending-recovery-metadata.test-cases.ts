import { WagoManagedAccess, WagoDeviceOperation } from './wago-managed-access.entity';
import { managedSsh } from './wago-managed-ssh';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleFencesRuntimeRetriesWhenRetirementWinsOwnershipAndRetainsPendingRecoveryMetadata(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('fences runtime retries when retirement wins ownership and retains pending recovery metadata', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    await scope.db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    const operations = scope.service['operations'];
    const acquire = operations.acquire.bind(operations);
    jest.spyOn(operations, 'acquire').mockImplementation(async (...args) => {
      await scope.db.getRepository(WagoManagedAccess).update(1, { state: 'retiring' });
      return acquire(...args);
    });
    jest.mocked(managedSsh).mockClear();
    await expect(scope.service.retryRuntime(1)).rejects.toThrow('management_required');
    expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
    expect((await scope.service.sessionStatus(1)).management).toBe('retiring');
    expect(
      await scope.db.getRepository(WagoDeviceOperation).findOneBy({ fingerprint: scope.session().hostKeyFingerprint }),
    ).toMatchObject({ owner: null });
  });
}

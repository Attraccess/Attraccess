import { WagoManagedAccess } from './wago-managed-access.entity';
import { managedSsh } from './wago-managed-ssh';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleVerifiesTheEncryptedDatabaseRoundTripAndFailsBeforeRemoteChangesWhenStorageIsCorrupt(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('verifies the encrypted database round trip and fails before remote changes when storage is corrupt', async () => {
    const repository = scope.db.getRepository(WagoManagedAccess);
    const save = repository.save.bind(repository);
    jest.spyOn(repository, 'save').mockImplementationOnce(async (value) => {
      const row = await save(value);
      await repository.update(1, { encryptedCredentials: 'corrupted-ciphertext' });
      return row;
    });
    const execute = jest.fn();
    await expect(scope.service.enrol(scope.session(), execute, new AbortController().signal)).rejects.toThrow(
      'unavailable',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(managedSsh).not.toHaveBeenCalled();
  });
}

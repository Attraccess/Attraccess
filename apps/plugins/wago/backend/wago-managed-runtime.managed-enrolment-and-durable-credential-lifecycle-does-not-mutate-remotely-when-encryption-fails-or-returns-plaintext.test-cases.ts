import { WagoManagedAccess } from './wago-managed-access.entity';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleDoesNotMutateRemotelyWhenEncryptionFailsOrReturnsPlaintext(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('does not mutate remotely when encryption fails or returns plaintext', async () => {
    scope.encrypt.mockImplementation((plaintext) => plaintext);
    const execute = jest.fn();
    await expect(scope.service.enrol(scope.session(), execute, new AbortController().signal)).rejects.toThrow(
      'encryption',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(await scope.db.getRepository(WagoManagedAccess).count()).toBe(0);
  });
}

import { WagoManagedAccess } from './wago-managed-access.entity';
import { managedSsh } from './wago-managed-ssh';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleRetainsThePendingIdentityAfterLostKeyCleanupAndRetriesWithoutGeneratingReplacementSecre(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('retains the pending identity after lost key cleanup and retries without generating replacement secrets', async () => {
    jest.mocked(managedSsh).mockImplementation(async (_access, _key, header) => {
      if (header.startsWith('access-key-commit')) {
        expect(await scope.db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
          state: 'verified',
        });
        throw new Error('lost receipt');
      }
      return `OK ${header.split(' ')[1]}\n`;
    });
    await expect(
      scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal),
    ).rejects.toThrow('Managed SSH setup failed (commit)');
    const before = (await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0]
      .encrypted_credentials;
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
      );
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    expect(
      (await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0].encrypted_credentials,
    ).toBe(before);
  });
}

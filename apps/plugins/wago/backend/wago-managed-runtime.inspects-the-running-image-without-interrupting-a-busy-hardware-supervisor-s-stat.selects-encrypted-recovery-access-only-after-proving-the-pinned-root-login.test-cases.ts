import type { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';

export function registerSelectsEncryptedRecoveryAccessOnlyAfterProvingThePinnedRootLogin(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('selects encrypted recovery access only after proving the pinned root login', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    const row = (await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0];
    const credentials = JSON.parse(scope.decrypt(row.encrypted_credentials));
    expect(await scope.service.commissioningRecoveryPassword(scope.session())).toBe(credentials.recoveryPassword);
    scope.rootProbe.mockResolvedValue(false);
    expect(await scope.service.commissioningRecoveryPassword(scope.session())).toBeNull();
    expect(await scope.service.sessionStatus(1)).not.toHaveProperty('password');
    await expect(
      scope.service.commissioningRecoveryPassword(Object.assign(scope.session(), { targetHost: '10.77.0.8' })),
    ).rejects.toThrow('identity changed');
  });
}

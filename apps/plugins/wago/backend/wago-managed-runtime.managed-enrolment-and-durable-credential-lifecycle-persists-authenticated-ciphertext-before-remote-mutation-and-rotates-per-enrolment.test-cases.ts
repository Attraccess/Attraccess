import { WagoManagedAccess } from './wago-managed-access.entity';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecyclePersistsAuthenticatedCiphertextBeforeRemoteMutationAndRotatesPerEnrolment(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('persists authenticated ciphertext before remote mutation and rotates per enrolment', async () => {
    const execute = jest.fn(async (_script: string) => {
      const rows = await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access');
      expect(rows[0].encrypted_credentials).not.toContain('PRIVATE KEY');
      expect(JSON.parse(scope.decrypt(rows[0].encrypted_credentials))).toMatchObject({ sessionId: 1 });
      return 'OK\n';
    });
    await scope.service.enrol(scope.session(), execute, new AbortController().signal);
    await scope.service.enrol(scope.session(2), async () => 'OK\n', new AbortController().signal);
    const rows = await scope.db.query(
      'SELECT encrypted_credentials, key_fingerprint FROM plugin_wago_managed_access ORDER BY session_id',
    );
    const first = JSON.parse(scope.decrypt(rows[0].encrypted_credentials)),
      second = JSON.parse(scope.decrypt(rows[1].encrypted_credentials));
    expect(first.privateKey).not.toEqual(second.privateKey);
    expect(first.recoveryPassword).not.toEqual(second.recoveryPassword);
    expect(scope.rootProbe).toHaveBeenCalledWith(
      scope.session().targetHost,
      scope.session().hostKeyFingerprint,
      first.recoveryPassword,
    );
    expect(await scope.db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).not.toHaveProperty(
      'encryptedCredentials',
    );
    expect(await scope.service.recoverPassword(1, scope.principal)).toEqual({ password: first.recoveryPassword });
    expect(await scope.service.status(100)).toEqual({
      sessionId: null,
      management: 'reenrol_required',
      keyFingerprint: null,
      update: null,
      physicalQualification: 'unverified',
    });
  });
}

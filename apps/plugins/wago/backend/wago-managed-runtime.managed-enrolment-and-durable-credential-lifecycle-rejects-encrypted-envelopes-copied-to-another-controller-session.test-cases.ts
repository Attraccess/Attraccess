import { WagoManagedAccess } from './wago-managed-access.entity';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleRejectsEncryptedEnvelopesCopiedToAnotherControllerSession(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('rejects encrypted envelopes copied to another controller/session', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    await scope.db.getRepository(WagoManagedAccess).update(1, { fingerprint: `SHA256:${'b'.repeat(43)}` });
    await expect(scope.service.recoverPassword(1, scope.principal)).rejects.toThrow('does not match');
  });
}

import { WagoManagedAccess } from './wago-managed-access.entity';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleVisiblyBlocksUnreadableManagedCredentialsWithoutExposingTheEnvelope(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('visibly blocks unreadable managed credentials without exposing the envelope', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    await scope.db.getRepository(WagoManagedAccess).update(1, {
      controllerId: 1,
      state: 'managed',
      encryptedCredentials: 'corrupt-secret-envelope',
    });
    const status = await scope.service.status(1);
    expect(status.management).toBe('recovery_required');
    expect(JSON.stringify(status)).not.toContain('corrupt-secret-envelope');
    await expect(scope.service.assertRemovable(1)).rejects.toThrow('retire managed');
  });
}

import { WagoManagedAccess } from './wago-managed-access.entity';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleRetainsRetirementIntentAndRecoverySecretsUntilRemoteKeyRemovalIsIndependentlyVerified(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('retains retirement intent and recovery secrets until remote key removal is independently verified', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    await scope.db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    await expect(scope.service.assertRemovable(1)).rejects.toThrow('retire managed');
    const probe = jest.fn(async () => false);
    scope.service.registerRetirementProbe(probe);
    await expect(scope.service.restoreAccess(1, scope.principal)).rejects.toThrow('retirement is unverified');
    expect((await scope.service.sessionStatus(1)).management).toBe('retiring');
    await expect(scope.service.retryAccess(1)).rejects.toThrow('cannot be retried');
    // A restarted request can observe the removal, even after losing its SSH reply.
    probe.mockResolvedValue(true);
    await scope.service.restoreAccess(1, scope.principal);
    expect((await scope.service.sessionStatus(1)).management).toBe('retired');
    await expect(scope.service.assertRemovable(1)).resolves.toBeUndefined();
    expect(await scope.service.recoverPassword(1, scope.principal)).toEqual({ password: expect.any(String) });
  });
}

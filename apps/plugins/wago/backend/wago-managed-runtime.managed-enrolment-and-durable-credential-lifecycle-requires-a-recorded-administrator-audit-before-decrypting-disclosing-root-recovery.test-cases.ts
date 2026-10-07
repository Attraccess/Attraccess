import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleRequiresARecordedAdministratorAuditBeforeDecryptingDisclosingRootRecovery(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('requires a recorded administrator audit before decrypting/disclosing root recovery', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    scope.decrypt.mockClear();
    scope.audit.mockResolvedValue({ status: 'unavailable' });
    await expect(scope.service.recoverPassword(1, scope.principal)).rejects.toThrow('Durable audit');
    expect(scope.decrypt).not.toHaveBeenCalled();
    expect(JSON.stringify(scope.audit.mock.calls)).not.toContain('PRIVATE KEY');
    scope.audit.mockResolvedValue({ status: 'recorded' });
    const result = await scope.service.recoverPassword(1, scope.principal);
    expect(result).toEqual({ password: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    expect(result).not.toHaveProperty('privateKey');
  });
}

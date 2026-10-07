import { WagoManagedAccess } from './wago-managed-access.entity';
import { managedSsh } from './wago-managed-ssh';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleRetainsRecoveryIntentOnFailedSecondKeyConnectionWithoutDisablingSshPolicy(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('retains recovery intent on failed second key connection without disabling SSH policy', async () => {
    jest.mocked(managedSsh).mockRejectedValue(new Error('transport output with fixture secret'));
    const execute = jest.fn(async (_script: string) => 'OK\n');
    await expect(scope.service.enrol(scope.session(), execute, new AbortController().signal)).rejects.toThrow(
      'Managed SSH setup failed (proof)',
    );
    expect(await scope.db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
      state: 'recovery_required',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).not.toContain('dropbear restart');
    expect(scope.rootProbe).not.toHaveBeenCalled();
  });
}

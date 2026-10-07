import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRetainsAnOldRestoredTokenWhenFinalLifecycleReconciliationFails(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('retains an old restored token when final lifecycle reconciliation fails', async () => {
    const token = 'c'.repeat(32);
    await scope.db.getRepository(WagoCommissioningSession).update(scope.session.id, {
      dockerProvisionToken: token,
      dockerProvisionState: 'restored',
    });
    jest.spyOn(scope.service as never, 'sudoRunScript').mockRejectedValue(new Error('unresolved-lifecycle-effects') as never);
    const result = await scope.service.platform(
      scope.session.id,
      'recover',
      {
        temporarySsh: scope.credential,
        reviewedDockerActivation: true,
      },
      scope.principal,
    );
    expect(result.dockerProvisionState).toBe('recovery_required');
    expect(result.failureReason).toContain('cleanup remains unverified');
    expect(
      (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id })).dockerProvisionToken,
    ).toBe(token);
  });
}

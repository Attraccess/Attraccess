import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRetriesOnlyPreparationAcknowledgementAfterRuntimeCleanupAndPreparationContainmentSucceeded(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('retries only preparation acknowledgement after runtime cleanup and preparation containment succeeded', async () => {
    const token = 'd'.repeat(32);
    const repository = scope.db.getRepository(WagoCommissioningSession);
    await repository.update(scope.session.id, {
      state: 'delivery_failed',
      deliveryToken: token,
      dockerProvisionToken: token,
      dockerProvisionState: 'started',
    });
    const remote = jest
      .spyOn(scope.service as never, 'sudoRunScript')
      .mockResolvedValueOnce('' as never) // runtime cleanup
      .mockResolvedValueOnce('' as never) // runtime acknowledgement
      .mockResolvedValueOnce('' as never) // preparation containment
      .mockRejectedValueOnce(new Error('lost preparation acknowledgement') as never);
    const input = { confirmInstall: true, temporarySsh: scope.credential };
    const failed = await scope.service.recover(scope.session.id, input, scope.principal);
    expect(failed).toMatchObject({ state: 'recovery_revocation_pending', dockerProvisionState: 'restored' });
    expect((await repository.findOneByOrFail({ id: scope.session.id })).dockerProvisionToken).toBe(token);
    remote.mockClear().mockResolvedValue('' as never);
    const result = await scope.service.recover(scope.session.id, input, scope.principal);
    expect(remote).toHaveBeenCalledTimes(2); // runtime receipt acknowledgement + preparation finish only
    expect(result).toMatchObject({ state: 'delivery_failed', dockerProvisionState: null, failureReason: null });
    expect(result.runtimeRecoveryAvailable).toBeUndefined();
    expect((await repository.findOneByOrFail({ id: scope.session.id })).dockerProvisionToken).toBeNull();
  });
}

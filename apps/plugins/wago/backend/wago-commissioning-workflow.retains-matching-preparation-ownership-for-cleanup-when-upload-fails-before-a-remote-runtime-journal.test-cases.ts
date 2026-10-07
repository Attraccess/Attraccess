import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRetainsMatchingPreparationOwnershipForCleanupWhenUploadFailsBeforeARemoteRuntimeJournal(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('retains matching preparation ownership for cleanup when upload fails before a remote runtime journal exists', async () => {
    const repository = scope.db.getRepository(WagoCommissioningSession);
    const remote = jest
      .spyOn(scope.service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? scope.clockOutput() : '') as never);
    jest.spyOn(scope.service as never, 'copyTo').mockRejectedValue(new Error('connection failed before stdin') as never);
    const input = { confirmInstall: true, temporarySsh: scope.credential };
    expect(await scope.service.deliver(scope.session.id, input, scope.principal)).toMatchObject({
      state: 'delivery_failed',
      runtimeRecoveryAvailable: true,
    });
    const failed = await repository.findOneByOrFail({ id: scope.session.id });
    expect(failed.deliveryToken).toBe(failed.dockerProvisionToken);
    expect(failed.deliveryToken).toMatch(/^[a-f0-9]{32}$/);
    remote.mockClear();
    const recovered = await scope.service.recover(scope.session.id, input, scope.principal);
    expect(remote.mock.calls[0][3]).toContain('No preparation recovery ownership');
    expect(remote.mock.calls[0][3]).toContain(failed.deliveryToken);
    expect(recovered).toMatchObject({ state: 'delivery_failed', dockerProvisionState: null, failureReason: null });
    expect(recovered.runtimeRecoveryAvailable).toBeUndefined();
  });
}

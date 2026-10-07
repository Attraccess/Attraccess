import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerFailsVisiblyInsteadOfClaimingAnObsoleteRuntimeWhenTheReleaseChangesDuringSshTransfer(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('fails visibly instead of claiming an obsolete runtime when the release changes during SSH transfer', async () => {
    jest
      .spyOn(scope.service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? scope.clockOutput() : '') as never);
    jest.spyOn(scope.service as never, 'copyTo').mockImplementation((async () => {
      scope.artifacts.current.mockResolvedValue({ digest: 'b'.repeat(64) });
    }) as never);
    const result = await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal);
    expect(result.state).toBe('delivery_failed');
    expect(result.failureReason).toContain('runtime release changed');
    expect(
      (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id })).deliveryToken,
    ).not.toBeNull();
    expect(scope.wago.revokeEnrollmentById).toHaveBeenCalled();
  });
}

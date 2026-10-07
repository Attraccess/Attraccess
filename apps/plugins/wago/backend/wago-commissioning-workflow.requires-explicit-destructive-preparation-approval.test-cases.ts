import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRequiresExplicitDestructivePreparationApproval(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('requires explicit destructive preparation approval', async () => {
    const remote = jest.spyOn(scope.service as never, 'sudoRunScript');
    await expect(scope.service.platform(scope.session.id, 'activate', { temporarySsh: scope.credential }, scope.principal)).rejects.toThrow(
      'Explicit Docker',
    );
    expect(remote).not.toHaveBeenCalled();
  });
}

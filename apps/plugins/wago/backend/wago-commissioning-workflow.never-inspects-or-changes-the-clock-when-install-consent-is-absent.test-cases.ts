import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerNeverInspectsOrChangesTheClockWhenInstallConsentIsAbsent(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('never inspects or changes the clock when install consent is absent', async () => {
    const remote = jest.spyOn(scope.service as never, 'sudoRunScript');
    scope.wago.createEnrollment.mockClear();
    await expect(scope.service.deliver(scope.session.id, { temporarySsh: scope.credential }, scope.principal)).rejects.toThrow();
    expect(remote).not.toHaveBeenCalled();
    expect(scope.wago.createEnrollment).not.toHaveBeenCalled();
  });
}

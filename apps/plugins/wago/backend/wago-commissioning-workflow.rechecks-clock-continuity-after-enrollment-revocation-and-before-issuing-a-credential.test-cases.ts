import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRechecksClockContinuityAfterEnrollmentRevocationAndBeforeIssuingACredential(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('rechecks clock continuity after enrollment revocation and before issuing a credential', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    jest
      .spyOn(scope.service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? scope.clockOutput() : '') as never);
    jest.spyOn(scope.service as never, 'revokeSessionEnrollment').mockImplementation((async () => {
      jest.spyOn(Date, 'now').mockReturnValue(now + 10_000);
    }) as never);
    scope.wago.createEnrollment.mockClear();
    const copy = jest.spyOn(scope.service as never, 'copyTo');
    const result = await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal);
    expect(result.state).toBe('delivery_failed');
    expect(scope.wago.createEnrollment).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });
}

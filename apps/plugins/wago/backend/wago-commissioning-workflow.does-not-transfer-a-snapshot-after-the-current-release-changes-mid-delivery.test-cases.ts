import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerDoesNotTransferASnapshotAfterTheCurrentReleaseChangesMidDelivery(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('does not transfer a snapshot after the current release changes mid-delivery', async () => {
    scope.artifacts.current.mockResolvedValueOnce({ digest: scope.digest }).mockResolvedValue({ digest: 'b'.repeat(64) });
    jest
      .spyOn(scope.service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=") ? scope.clockOutput() : '') as never);
    const copy = jest.spyOn(scope.service as never, 'copyTo');
    const result = await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal);
    expect(result.state).toBe('delivery_failed');
    expect(copy).not.toHaveBeenCalled();
    expect(scope.artifacts.current).toHaveBeenCalledTimes(2);
  });
}

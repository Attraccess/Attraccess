import { fw31IdentityOutput } from './fixtures/fw31-identity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerFailsClosedBeforeEnrollmentOrDeliveryWhenActiveCodesysCannotBeDisabled(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('fails closed before enrollment or delivery when active CODESYS cannot be disabled', async () => {
    jest.spyOn(scope.service as never, 'inspect').mockResolvedValue({
      firmware: fw31IdentityOutput(),
      codesys: 'active',
    } as never);
    jest
      .spyOn(scope.service as never, 'sudoRunScript')
      .mockResolvedValueOnce('' as never)
      .mockRejectedValue(new Error('private remote output') as never);
    const copy = jest.spyOn(scope.service as never, 'copyTo');
    scope.wago.createEnrollment.mockClear();
    const result = await scope.service.deliver(scope.session.id, { temporarySsh: scope.credential, confirmInstall: true }, scope.principal);
    expect(result).toMatchObject({
      state: 'delivery_failed',
      codesysState: 'active',
      dockerProvisionState: 'recovery_required',
    });
    expect(result.failureReason).toContain('permanently disabled');
    expect(result.failureReason).not.toContain('private remote output');
    expect(scope.wago.createEnrollment).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });
}

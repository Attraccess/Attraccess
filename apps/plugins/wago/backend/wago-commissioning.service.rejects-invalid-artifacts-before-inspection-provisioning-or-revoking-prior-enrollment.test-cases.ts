import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerRejectsInvalidArtifactsBeforeInspectionProvisioningOrRevokingPriorEnrollment(scope: WagoCommissioningServiceTestScope): void {
it('rejects invalid artifacts before inspection, provisioning or revoking prior enrollment', async () => {
    const { service, session, wago, inspect, sudo } = scope.securityHarness(
      { state: 'delivery_failed', enrollmentId: 7 },
      scope.configuredService(),
    );
    service['acquireRuntimeBundle'] = jest.fn().mockRejectedValue(new Error('invalid build assets'));
    const result = await service.deliver(1, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: 'provided' },
    });
    expect(session.enrollmentId).toBe(7);
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
    expect(wago.createEnrollment).not.toHaveBeenCalled();
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
    expect(result.state).toBe('delivery_failed');
    expect(JSON.stringify(result)).not.toContain('provided');
  });
}

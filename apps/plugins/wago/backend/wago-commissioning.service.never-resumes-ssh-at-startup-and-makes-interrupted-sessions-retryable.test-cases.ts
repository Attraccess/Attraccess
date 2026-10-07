import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerNeverResumesSshAtStartupAndMakesInterruptedSessionsRetryable(scope: WagoCommissioningServiceTestScope): void {
it('never resumes SSH at startup and makes interrupted sessions retryable', async () => {
    const { service, session, repository, wago, inspect } = scope.securityHarness({ state: 'delivering', enrollmentId: 7 });
    repository.find.mockResolvedValue([session]);
    await service.onApplicationBootstrap();
    expect(session.state).toBe('delivery_failed');
    expect(session.enrollmentId).toBeNull();
    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(7, expect.any(Function));
    expect(inspect).not.toHaveBeenCalled();
    expect(wago.registerCommissioningDiscoveryHandler).toHaveBeenCalledTimes(1);
    await expect(service.deliver(1, { confirmInstall: true })).rejects.toThrow('explicit valid SSH');
  });
}

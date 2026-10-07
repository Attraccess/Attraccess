import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerQueuesEarlyDiscoveryUntilDeliveryFinishesAndDoesNotReportVerifiedSuccess(scope: WagoCommissioningServiceTestScope): void {
it('queues early discovery until delivery finishes and does not report verified success', async () => {
    const { service, session, wago, repository } = scope.securityHarness({ state: 'delivering', enrollmentId: 7 });
    let release!: () => void;
    const locked = service['withDeliveryLock'](
      1,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    const claim = service.claimDiscovered({ id: 4, hardwareId: session.hardwareId, mqttServerId: 2, enrollmentId: 7 });
    await Promise.resolve();
    expect(wago.claim).not.toHaveBeenCalled();
    expect(repository.findOneBy).toHaveBeenCalledWith({
      hardwareId: session.hardwareId,
      mqttServerId: 2,
      enrollmentId: 7,
    });
    session.state = 'awaiting_discovery';
    release();
    await locked;
    await claim;
    expect(wago.claim).toHaveBeenCalledTimes(1);
    expect(session.state).toBe('awaiting_verification');
  });
}

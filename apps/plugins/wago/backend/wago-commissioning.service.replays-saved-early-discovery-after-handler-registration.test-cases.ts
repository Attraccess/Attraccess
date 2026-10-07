import { WagoController } from './wago-controller.entity';
import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerReplaysSavedEarlyDiscoveryAfterHandlerRegistration(scope: WagoCommissioningServiceTestScope): void {
it('replays saved early discovery after handler registration', async () => {
    const { service, session, repository, context, wago } = scope.securityHarness({
      state: 'awaiting_discovery',
      enrollmentId: 7,
    });
    repository.find.mockResolvedValue([session]);
    context.getRepository.mockImplementation((entity) =>
      entity === WagoController
        ? {
            findOneBy: jest.fn().mockResolvedValue({
              id: 4,
              hardwareId: session.hardwareId,
              mqttServerId: 2,
              enrollmentId: 7,
              trustState: 'untrusted',
            }),
          }
        : repository,
    );
    await service['reconcileDiscovery']();
    expect(wago.claim).toHaveBeenCalledWith(4, 'Test', scope.verifier, 2, expect.any(Function));
    expect(session.state).toBe('awaiting_verification');
  });
}

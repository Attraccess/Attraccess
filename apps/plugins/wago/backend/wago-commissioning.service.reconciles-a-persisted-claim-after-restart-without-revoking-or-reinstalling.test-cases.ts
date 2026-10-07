import { WagoController } from './wago-controller.entity';
import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerReconcilesAPersistedClaimAfterRestartWithoutRevokingOrReinstalling(scope: WagoCommissioningServiceTestScope): void {
it('reconciles a persisted claim after restart without revoking or reinstalling', async () => {
    const { service, session, repository, context, wago, inspect } = scope.securityHarness({
      state: 'awaiting_claim',
      enrollmentId: 7,
    });
    repository.find.mockResolvedValue([session]);
    context.getRepository.mockImplementation((entity) =>
      entity === WagoController ? { findOneBy: jest.fn().mockResolvedValue({ trustState: 'claimed' }) } : repository,
    );
    await service.onApplicationBootstrap();
    expect(session.state).toBe('claim_interrupted');
    expect(session.pairingCode).not.toBeNull();
    expect(wago.revokeEnrollmentById).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });
}

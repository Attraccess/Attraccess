import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerFailsClosedWithSafeErrorsDuringSRecoveryFailure(scope: WagoCommissioningServiceTestScope): void {
it.each(['broker', 'database', 'decrypt'])(
    'fails closed with safe errors during %s recovery failure',
    async (failure) => {
      const { service, session, repository, wago, context } = scope.securityHarness({
        state: 'awaiting_discovery',
        enrollmentId: 7,
      });
      repository.find.mockResolvedValue([session]);
      if (failure === 'database') repository.find.mockRejectedValue(new Error('unlabelled-secret'));
      else {
        if (failure === 'broker') session.pairingCode = 'plaintext';
        else
          context.secrets.decrypt.mockImplementation(() => {
            throw new Error('unlabelled-secret');
          });
        wago.revokeEnrollmentById.mockRejectedValue(new Error('unlabelled-secret'));
      }
      await service.onApplicationBootstrap();
      expect(wago.registerCommissioningDiscoveryHandler).not.toHaveBeenCalled();
      expect(JSON.stringify(context.logger.warn.mock.calls)).not.toContain('unlabelled-secret');
      if (failure !== 'database') {
        expect(session.pairingCode).toBeNull();
        expect(session.state).toBe('revoked');
        expect(session.enrollmentId).toBe(7);
      }
    },
  );
}

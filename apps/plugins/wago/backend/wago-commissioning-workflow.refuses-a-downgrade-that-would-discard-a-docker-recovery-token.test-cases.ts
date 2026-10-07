import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { AddWagoCommissioningPrincipal1780000000009 } from './migrations/1780000000009-add-wago-commissioning-principal';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRefusesADowngradeThatWouldDiscardADockerRecoveryToken(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('refuses a downgrade that would discard a Docker recovery token', async () => {
    await scope.db.getRepository(WagoCommissioningSession).update(scope.session.id, { dockerProvisionToken: 'c'.repeat(32) });
    const runner = scope.db.createQueryRunner();
    try {
      await expect(new AddWagoCommissioningPrincipal1780000000009().down(runner)).rejects.toThrow(
        'Recover Docker provisioning',
      );
      expect(
        (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id })).dockerProvisionToken,
      ).toBe('c'.repeat(32));
    } finally {
      await runner.release();
    }
  });
}

import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRetainsInterruptedSPreparationForExplicitCleanupAfterRestart(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it.each(['starting', 'recovering'])(
    'retains interrupted %s preparation for explicit cleanup after restart',
    async (state) => {
      const repository = scope.db.getRepository(WagoCommissioningSession);
      await repository.update(scope.session.id, { dockerProvisionToken: 'c'.repeat(32), dockerProvisionState: state });
      const remote = jest.spyOn(scope.service as never, 'sudoRunScript');
      await scope.service.onApplicationBootstrap();
      expect(await repository.findOneByOrFail({ id: scope.session.id })).toMatchObject({
        dockerProvisionToken: 'c'.repeat(32),
        dockerProvisionState: 'recovery_required',
      });
      expect(remote).not.toHaveBeenCalled();
    },
  );
}

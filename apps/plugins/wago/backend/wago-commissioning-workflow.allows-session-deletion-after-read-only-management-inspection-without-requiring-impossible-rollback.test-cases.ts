import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoManagementEntity } from './wago-management.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerAllowsSessionDeletionAfterReadOnlyManagementInspectionWithoutRequiringImpossibleRollback(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('allows session deletion after read-only management inspection without requiring impossible rollback', async () => {
    await scope.db.getRepository(WagoManagementEntity).save({
      controllerId: 9,
      leaseUntil: 0,
      metadataJson: JSON.stringify({
        target: { controllerId: 9, host: scope.session.targetHost, hostKeyFingerprint: scope.session.hostKeyFingerprint },
        state: 'inspected',
        inspection: null,
        mode: null,
        exceptions: [],
        support: 'qualification_required',
        reviewToken: null,
        reviewedAt: null,
        transaction: null,
        keyFingerprint: null,
        failure: null,
      }),
    });
    await scope.db.getRepository(WagoCommissioningSession).update(scope.session.id, { managementControllerId: 9 });
    await scope.service.remove(scope.session.id);
    expect(await scope.db.getRepository(WagoCommissioningSession).findOneBy({ id: scope.session.id })).toBeNull();
  });
}

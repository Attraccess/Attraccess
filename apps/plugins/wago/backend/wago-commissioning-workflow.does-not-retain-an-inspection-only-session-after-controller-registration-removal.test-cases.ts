import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoManagementEntity } from './wago-management.entity';
import { WagoController } from './wago-controller.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerDoesNotRetainAnInspectionOnlySessionAfterControllerRegistrationRemoval(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('does not retain an inspection-only session after controller registration removal', async () => {
    await scope.db.getRepository(WagoController).save({
      id: 9,
      hardwareId: scope.session.hardwareId,
      trustState: 'claimed',
      mqttServerId: 1,
      pairingCodeHash: 'fixture',
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: '[]',
      lastSequence: 0,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
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
    await scope.service.removeControllerSafely(9, async (assertOwned) => {
      await assertOwned();
      await scope.db.getRepository(WagoController).delete(9);
      return scope.session.hardwareId;
    });
    expect(await scope.service.list()).toEqual([]);
  });
}

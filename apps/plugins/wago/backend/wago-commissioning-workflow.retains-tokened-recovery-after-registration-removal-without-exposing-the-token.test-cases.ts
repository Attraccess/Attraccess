import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoController } from './wago-controller.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRetainsTokenedRecoveryAfterRegistrationRemovalWithoutExposingTheToken(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('retains tokened recovery after registration removal, without exposing the token', async () => {
    const controller = await scope.db.getRepository(WagoController).save({
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
    await scope.db.getRepository(WagoCommissioningSession).update(scope.session.id, { deliveryToken: 'b'.repeat(32) });
    await scope.service.removeControllerSafely(controller.id, async (assertOwned) => {
      await assertOwned();
      await scope.db.getRepository(WagoController).delete(controller.id);
      return scope.session.hardwareId;
    });
    const retained = (await scope.service.list())[0];
    expect(retained).toMatchObject({ state: 'revoked', runtimeRecoveryAvailable: true });
    expect(retained).not.toHaveProperty('deliveryToken');
    jest.spyOn(scope.service as never, 'sudoRunScript').mockResolvedValue('' as never);
    const restored = await scope.service.recover(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential });
    expect(restored.progressStep).toBe('Runtime installation cleaned up');
    expect(restored.runtimeRecoveryAvailable).toBeUndefined();
  });
}

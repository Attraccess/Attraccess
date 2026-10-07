import { WagoController } from '../backend/wago-controller.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerRejectsAManualHandoffToARuntimeWithoutExpirySupportBeforeDispatchOrAuditAdmission(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('rejects a manual handoff to a runtime without expiry support before dispatch or audit admission', async () => {
    const { controller } = await scope.manuallyEnrolledController();
    await scope.db
      .getRepository(WagoController)
      .update(controller.id, { capabilities: '["claim","configuration-v1"]' });
    scope.mqtt.publish.mockClear();
    await scope
      .post(`controllers/${controller.id}/credentials/manual/complete`, {
        name: 'Manual fixture',
        verifier: scope.verifier,
        username: 'wago-controller-manual-fixture',
        password: scope.privateValue,
      })
      .expect(409);
    expect(scope.mqtt.publish).not.toHaveBeenCalled();
    expect(await scope.rows('manual_credential_fallback')).toHaveLength(0);
  });
}

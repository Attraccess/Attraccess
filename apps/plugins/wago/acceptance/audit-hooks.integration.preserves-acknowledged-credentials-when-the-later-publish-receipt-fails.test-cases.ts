import { WagoController } from '../backend/wago-controller.entity';
import { WagoCommissioningSession } from '../backend/wago-commissioning-session.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerPreservesAcknowledgedCredentialsWhenTheLaterPublishReceiptFails(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('preserves acknowledged credentials when the later publish receipt fails', async () => {
    const { controller, provision } = await scope.manuallyEnrolledController();
    // Associate the manually enrolled controller with a real pinned commissioning session.
    await scope.db.getRepository(WagoCommissioningSession).update(scope.session.id, {
      hardwareId: controller.hardwareId,
    });
    scope.mqtt.publish.mockImplementation(async (_server, topic, payload) => {
      if (!topic.endsWith('/claim')) return;
      const credentials = JSON.parse(payload.toString());
      await scope.mqtt.receive(`${topic}/ack`, { acknowledgementToken: credentials.acknowledgementToken });
      throw new Error(scope.privateValue);
    });
    await scope
      .post(`controllers/${controller.id}/credentials/manual/complete`, {
        name: 'Manual fixture',
        verifier: scope.verifier,
        username: 'wago-controller-manual-fixture',
        password: scope.privateValue,
      })
      .expect(409);
    await scope.lifecycle('manual_credential_fallback', controller.id, 'failed');
    expect(provision).not.toHaveBeenCalled();
    expect(scope.revoke.mock.calls).not.toContainEqual([
      expect.objectContaining({ identity: 'wago-controller-manual-fixture' }),
    ]);
    expect((await scope.db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe(
      'claimed',
    );
    expect(JSON.stringify(await scope.rows('manual_credential_fallback'))).not.toContain(scope.privateValue);
  });
}

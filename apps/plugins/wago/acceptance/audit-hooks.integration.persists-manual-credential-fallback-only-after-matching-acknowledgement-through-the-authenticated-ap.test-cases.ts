import { WagoController } from '../backend/wago-controller.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerPersistsManualCredentialFallbackOnlyAfterMatchingAcknowledgementThroughTheAuthenticatedAp(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('persists manual credential fallback only after matching acknowledgement through the authenticated API', async () => {
    const { controller, provision } = await scope.manuallyEnrolledController();
    scope.mqtt.publish.mockImplementation(async (_server, topic, payload) => {
      if (!topic.endsWith('/claim')) return;
      const credentials = JSON.parse(payload.toString());
      expect(credentials.password).toBe(scope.privateValue);
      expect(Date.parse(credentials.expiresAt)).toBeGreaterThan(Date.now());
      expect(Date.parse(credentials.expiresAt)).toBeLessThanOrEqual(Date.now() + 30_000);
      expect((await scope.rows('manual_credential_fallback')).map((row) => row.outcome)).toEqual(['attempted']);
      await scope.mqtt.receive(`${topic}/ack`, { acknowledgementToken: 'incorrect-token' });
      expect(await scope.rows('manual_credential_fallback')).toHaveLength(1);
      await scope.mqtt.receive(`${topic}/ack`, { acknowledgementToken: credentials.acknowledgementToken });
    });
    const input = {
      name: 'Manual fixture',
      verifier: scope.verifier,
      username: 'wago-controller-manual-fixture',
      password: scope.privateValue,
    };
    await scope.post(`controllers/${controller.id}/credentials/manual/complete`, input, 'command-token').expect(403);
    expect(await scope.rows('manual_credential_fallback')).toHaveLength(0);
    await scope.post(`controllers/${controller.id}/credentials/manual/complete`, input).expect(201, {
      controllerId: controller.id,
      result: 'acknowledged',
    });
    await scope.lifecycle('manual_credential_fallback', controller.id);
    expect(provision).not.toHaveBeenCalled();
    expect((await scope.db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe(
      'claimed',
    );
    expect(JSON.stringify(await scope.rows('manual_credential_fallback'))).not.toContain(scope.privateValue);
  });
}

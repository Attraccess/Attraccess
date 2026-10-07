import { WagoController } from '../backend/wago-controller.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerPersistsFailedManualFallbackWithNoCredentialDispatchWhenThePhysicalVerifierIsWrong(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('persists failed manual fallback with no credential dispatch when the physical verifier is wrong', async () => {
    const { controller, provision } = await scope.manuallyEnrolledController();
    scope.mqtt.publish.mockClear();
    await scope
      .post(`controllers/${controller.id}/credentials/manual/complete`, {
        name: 'Manual fixture',
        verifier: 'incorrect-verifier',
        username: 'wago-controller-manual-fixture',
        password: scope.privateValue,
      })
      .expect(409);
    await scope.lifecycle('manual_credential_fallback', controller.id, 'failed');
    expect(provision).not.toHaveBeenCalled();
    expect(scope.mqtt.publish).not.toHaveBeenCalled();
    expect((await scope.db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe(
      'untrusted',
    );
    expect(JSON.stringify(await scope.rows('manual_credential_fallback'))).not.toContain(scope.privateValue);
  });
}

import { WagoController } from '../backend/wago-controller.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerRecordsFailedUnclaimOnCredentialRevocationFailureWithoutDeletingTheController(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('records failed unclaim on credential revocation failure without deleting the controller', async () => {
    const controller = await scope.deliverAndClaim();
    scope.revoke.mockRejectedValueOnce(new Error(scope.privateValue));
    await scope.remove(controller.id).expect(500);
    await scope.lifecycle('unclaim', controller.id, 'failed');
    expect(await scope.db.getRepository(WagoController).findOneBy({ id: controller.id })).not.toBeNull();
    expect(JSON.stringify(await scope.rows('unclaim'))).not.toContain(scope.privateValue);
  });
}

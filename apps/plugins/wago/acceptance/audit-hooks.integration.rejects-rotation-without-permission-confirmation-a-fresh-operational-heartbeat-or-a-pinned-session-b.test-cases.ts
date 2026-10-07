import { WagoController } from '../backend/wago-controller.entity';
import { WagoCommissioningSession } from '../backend/wago-commissioning-session.entity';
import { WagoCredentialRotationEntity } from '../backend/wago-credential-rotation.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerRejectsRotationWithoutPermissionConfirmationAFreshOperationalHeartbeatOrAPinnedSessionB(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('rejects rotation without permission, confirmation, a fresh operational heartbeat or a pinned session before broker mutation', async () => {
    const controller = await scope.deliverAndClaim();
    const rotate = scope.observeRotationProvider();
    const path = `controllers/${controller.id}/credentials/rotate`;
    await scope.post(path, { confirm: true }, 'command-token').expect(403);
    await scope.post(path, {}).expect(400);
    await scope.post(path, { confirm: true, retry: 'yes' }).expect(400);
    // Successful discovery/claim alone cannot establish permanent runtime readiness.
    await scope.post(path, { confirm: true }).expect(409);
    expect(
      JSON.parse((await scope.db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).capabilities),
    ).not.toContain('credential-rotation-v1');
    await scope.rotationReady(controller);
    await scope.db
      .getRepository(WagoController)
      .update(controller.id, { lastHeartbeatAt: new Date(Date.now() - 91_000).toISOString() });
    await scope.post(path, { confirm: true }).expect(409);
    await scope.db.getRepository(WagoController).update(controller.id, { lastHeartbeatAt: new Date().toISOString() });
    await scope.db.getRepository(WagoCommissioningSession).delete(scope.session.id);
    await scope.post(path, { confirm: true }).expect(409);
    expect(rotate).not.toHaveBeenCalled();
    expect(await scope.rows('credential_rotation')).toHaveLength(0);
    expect(await scope.db.getRepository(WagoCredentialRotationEntity).count()).toBe(0);
  });
}

import { AuditLog, Setting } from '@attraccess/database-entities';
import { SettingsStoreService } from '../../../api/src/settings/settings-store.service';
import { AuditService } from '../../../api/src/audit/audit.service';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerPersistsInitiatingTokenIdentityThroughActualDeliveryAndDiscoveryAutomaticClaimThenSurviv(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('persists initiating token identity through actual delivery and discovery automatic claim, then survives reopen', async () => {
    const controller = await scope.deliverAndClaim();
    await scope.lifecycle('commissioning.install', scope.session.id);
    await scope.lifecycle('claim', controller.id);
    await scope.mqtt.announce(scope.session.hardwareId, 'invalid-replay');
    expect(await scope.rows('claim')).toHaveLength(2);
    const before = await scope.db.getRepository(AuditLog).find({ order: { id: 'ASC' } });
    expect(JSON.stringify(before)).not.toContain(scope.privateValue);
    expect(JSON.stringify(before)).not.toContain(scope.verifier);
    expect(JSON.stringify(before)).not.toContain('WAGO_ENROLLMENT_SECRET');
    scope.wago.onModuleDestroy();
    await scope.audit.onModuleDestroy();
    await scope.db.destroy();
    await scope.db.initialize();
    scope.audit = new AuditService(scope.db, new SettingsStoreService(scope.db.getRepository(Setting), null));
    await scope.audit.onModuleInit();
    expect(await scope.db.getRepository(AuditLog).find({ order: { id: 'ASC' } })).toEqual(before);
    expect((await scope.audit.list({ limit: 100 })).items).toHaveLength(4);
  });
}

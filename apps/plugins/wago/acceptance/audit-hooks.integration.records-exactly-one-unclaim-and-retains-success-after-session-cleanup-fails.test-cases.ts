import { WagoController } from '../backend/wago-controller.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerRecordsExactlyOneUnclaimAndRetainsSuccessAfterSessionCleanupFails(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('records exactly one unclaim and retains success after session cleanup fails', async () => {
    const controller = await scope.deliverAndClaim();
    const original = scope.audit.record.bind(scope.audit);
    jest.spyOn(scope.audit, 'record').mockImplementation(async (event) => {
      if (event.action === 'wago.unclaim') {
        const persisted = await scope.db.getRepository(WagoController).findOneBy({ id: controller.id });
        expect(Boolean(persisted)).toBe(event.outcome === 'attempted');
      }
      return original(event);
    });
    // Actual removal succeeds; the subsequent commissioning history write fails.
    await scope.db.query(
      "CREATE TRIGGER fixture_cleanup_failure BEFORE UPDATE ON plugin_wago_commissioning_sessions WHEN NEW.state = 'revoked' BEGIN SELECT RAISE(ABORT, 'fixture cleanup failed'); END",
    );
    await scope.remove(controller.id).expect(500);
    await scope.lifecycle('unclaim', controller.id);
    expect(await scope.db.getRepository(WagoController).findOneBy({ id: controller.id })).toBeNull();
  });
}

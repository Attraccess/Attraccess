import { WagoConfigurationRevision } from '../backend/wago-configuration-revision.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerRetainsTheReusedPendingRevisionOnRepeatedForcedPublicationDispatchFailure(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('retains the reused pending revision on repeated forced-publication dispatch failure', async () => {
    const controller = await scope.deliverAndClaim();
    await scope.post(`controllers/${controller.id}/configuration/draft`, { snapshot: scope.snapshot }).expect(201);
    await scope.post(`controllers/${controller.id}/configuration/review`).expect(201);
    scope.mqtt.publish.mockRejectedValue(new Error(scope.privateValue));
    await scope.post(`controllers/${controller.id}/configuration/publish`, { force: true }).expect(500);
    await scope.post(`controllers/${controller.id}/configuration/review`).expect(201);
    await scope.post(`controllers/${controller.id}/configuration/publish`, { force: true }).expect(500);
    const revisions = await scope.db
      .getRepository(WagoConfigurationRevision)
      .find({ where: { controllerId: controller.id } });
    expect(revisions).toHaveLength(1);
    const records = await scope.rows('forced_publication');
    expect(records.map((row) => row.outcome)).toEqual(['attempted', 'failed', 'attempted', 'failed']);
    expect(records[1].details).toEqual({ revision: revisions[0].revision });
    expect(records[3].details).toEqual({ revision: revisions[0].revision });
    expect(records[0].operationId).toBe(records[1].operationId);
    expect(records[2].operationId).toBe(records[3].operationId);
    expect(records[0].operationId).not.toBe(records[2].operationId);
  });
}

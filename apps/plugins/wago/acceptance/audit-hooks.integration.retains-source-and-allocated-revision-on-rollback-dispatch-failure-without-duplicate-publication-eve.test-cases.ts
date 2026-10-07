import httpRequest from 'supertest';
import { WagoConfigurationRevision } from '../backend/wago-configuration-revision.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerRetainsSourceAndAllocatedRevisionOnRollbackDispatchFailureWithoutDuplicatePublicationEve(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('retains source and allocated revision on rollback dispatch failure without duplicate publication events', async () => {
    const controller = await scope.deliverAndClaim();
    const source = await scope.saveAndPublish(controller.id);
    const { body: preview } = await httpRequest(scope.app.getHttpServer())
      .get(`/wago/controllers/${controller.id}/configuration/revisions/${source.revision}/preview`)
      .set('Authorization', 'Bearer fixture-token')
      .expect(200);
    scope.mqtt.publish.mockRejectedValueOnce(new Error(scope.privateValue));
    await scope
      .post(`controllers/${controller.id}/configuration/rollback/${source.revision}`, {
        force: true,
        sourceHash: source.contentHash,
        currentHash: preview.current?.contentHash ?? null,
        draftHash: preview.draftHash,
      })
      .expect(500);
    const pending = await scope.db
      .getRepository(WagoConfigurationRevision)
      .findOneByOrFail({ controllerId: controller.id, state: 'pending' });
    expect(pending.revision).toBe(source.revision + 1);
    await scope.lifecycle('rollback', controller.id, 'failed', {
      sourceRevision: source.revision,
      revision: pending.revision,
    });
    expect(await scope.rows('publication')).toHaveLength(2);
    expect(await scope.rows('forced_publication')).toHaveLength(0);
    expect(JSON.stringify(await scope.rows('rollback'))).not.toContain(scope.privateValue);
  });
}

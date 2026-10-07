import { WagoConfigurationRevision } from '../backend/wago-configuration-revision.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerRetainsFailedPublicationEvidenceAfterAllocationWithoutRecordingTransportErrors(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('retains failed publication evidence after allocation without recording transport errors', async () => {
    const controller = await scope.deliverAndClaim();
    await scope.post(`controllers/${controller.id}/configuration/draft`, { snapshot: scope.snapshot }).expect(201);
    const { body: review } = await scope.post(`controllers/${controller.id}/configuration/review`).expect(201);
    scope.mqtt.publish.mockRejectedValueOnce(new Error(scope.privateValue));
    await scope
      .post(`controllers/${controller.id}/configuration/publish`, { reviewedHash: review.contentHash })
      .expect(500);
    const revision = await scope.db
      .getRepository(WagoConfigurationRevision)
      .findOneByOrFail({ controllerId: controller.id });
    expect(revision).toMatchObject({ revision: 1, state: 'pending' });
    const records = await scope.rows('publication');
    expect(records.map((row) => row.outcome)).toEqual(['attempted', 'failed']);
    expect(records[0].operationId).toBe(records[1].operationId);
    expect(JSON.stringify(records)).not.toContain(scope.privateValue);
    expect(records[1].details).toEqual({ revision: revision.revision });
  });
}

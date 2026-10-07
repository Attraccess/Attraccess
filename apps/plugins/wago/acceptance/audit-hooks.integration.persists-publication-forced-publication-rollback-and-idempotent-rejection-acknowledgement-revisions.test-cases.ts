import httpRequest from 'supertest';
import { AuditLog } from '@attraccess/database-entities';
import { WagoConfigurationRevision } from '../backend/wago-configuration-revision.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerPersistsPublicationForcedPublicationRollbackAndIdempotentRejectionAcknowledgementRevisions(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('persists publication, forced publication, rollback and idempotent rejection acknowledgement revisions', async () => {
    const controller = await scope.deliverAndClaim();
    const first = await scope.saveAndPublish(controller.id);
    await scope.lifecycle('publication', controller.id, 'succeeded', { revision: first.revision });
    const forced = await scope.saveAndPublish(controller.id, { ...scope.snapshot, logicalChannels: [] }, true);
    await scope.lifecycle('forced_publication', controller.id, 'succeeded', { revision: forced.revision });
    const { body: preview } = await httpRequest(scope.app.getHttpServer())
      .get(`/wago/controllers/${controller.id}/configuration/revisions/${first.revision}/preview`)
      .set('Authorization', 'Bearer fixture-token')
      .expect(200);
    const { body: restored } = await scope
      .post(`controllers/${controller.id}/configuration/rollback/${first.revision}`, {
        force: true,
        sourceHash: preview.revision.contentHash,
        currentHash: preview.current?.contentHash ?? null,
        draftHash: preview.draftHash,
      })
      .expect(201);
    await scope.lifecycle('rollback', controller.id, 'succeeded', {
      sourceRevision: first.revision,
      revision: restored.revision,
    });
    // Feed the device report into the real report handler; reception itself is not an operator audit event.
    await scope.wago['onConfigurationReported'](
      controller.id,
      Buffer.from(
        JSON.stringify({
          protocolVersion: 1,
          revision: restored.revision,
          contentHash: restored.contentHash,
          errors: [{ path: '$', code: 'fixture_rejected', message: scope.privateValue }],
        }),
      ),
    );
    const rejected = await scope.db
      .getRepository(WagoConfigurationRevision)
      .findOneByOrFail({ controllerId: controller.id, revision: restored.revision });
    expect(rejected.state).toBe('rejected');
    expect(await scope.rows('rejection_acknowledgement')).toHaveLength(0);
    const expected = { contentHash: rejected.contentHash, reportedAt: rejected.reportedAt };
    await scope
      .post(`controllers/${controller.id}/configuration/revisions/${rejected.revision}/acknowledge-rejection`, expected)
      .expect(201);
    await scope
      .post(`controllers/${controller.id}/configuration/revisions/${rejected.revision}/acknowledge-rejection`, expected)
      .expect(201);
    await scope.lifecycle('rejection_acknowledgement', controller.id, 'succeeded', { revision: rejected.revision });
    expect(
      (await scope.db.getRepository(WagoConfigurationRevision).findOneByOrFail({ id: rejected.id }))
        .rejectionAcknowledgedBy,
    ).toBe(42);
    expect(await scope.rows('publication')).toHaveLength(2); // Rollback must not nest publication lifecycles.
    expect(JSON.stringify(await scope.db.getRepository(AuditLog).find())).not.toContain(scope.privateValue);
  });
}

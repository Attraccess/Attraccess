import httpRequest from 'supertest';
import { AuditLog } from '@attraccess/database-entities';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerRejectsUnauthenticatedLifecycleRequestsBeforeCreatingAuditEvidence(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('rejects unauthenticated lifecycle requests before creating audit evidence', async () => {
    await httpRequest(scope.app.getHttpServer())
      .post(`/wago/commissioning/sessions/${scope.session.id}/deliver`)
      .send({ confirmInstall: true, temporarySsh: { username: 'root', password: scope.privateValue } })
      .expect(401);
    expect(await scope.db.getRepository(AuditLog).count()).toBe(0);
    expect(jest.mocked(scope.wago.createEnrollment)).not.toHaveBeenCalled();
  });
}

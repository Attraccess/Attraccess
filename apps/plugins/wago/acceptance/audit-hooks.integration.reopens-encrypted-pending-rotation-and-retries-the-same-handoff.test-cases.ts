import { Setting } from '@attraccess/database-entities';
import { SettingsStoreService } from '../../../api/src/settings/settings-store.service';
import { AuditService } from '../../../api/src/audit/audit.service';
import { WagoService } from '../backend/wago.service';
import { WagoController } from '../backend/wago-controller.entity';
import { WagoCommissioningService } from '../backend/wago-commissioning.service';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerReopensEncryptedPendingRotationAndRetriesTheSameHandoff(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('reopens encrypted pending rotation and retries the same handoff', async () => {
    const controller = await scope.deliverAndClaim();
    await scope.rotationReady(controller);
    const rotate = scope.observeRotationProvider();
    let firstPacket: Record<string, unknown>;
    scope.mqtt.publish.mockImplementation(async (_serverId, _topic, payload) => {
      firstPacket = JSON.parse(String(payload));
      throw new Error(scope.privateValue);
    });
    await scope.post(`controllers/${controller.id}/credentials/rotate`, { confirm: true }).expect(409);
    const pending = await scope.rotationRecord(controller.id);
    expect(pending).toMatchObject({ phase: 'pending', revision: 1 });
    expect(pending.encryptedCredentials).not.toContain(scope.privateValue);
    const failedEvidence = await scope.lifecycle('credential_rotation', controller.id, 'failed');
    await scope.app.close();
    scope.wago.onModuleDestroy();
    await scope.audit.onModuleDestroy();
    await scope.db.destroy();
    await scope.db.initialize();
    scope.audit = new AuditService(scope.db, new SettingsStoreService(scope.db.getRepository(Setting), null));
    await scope.audit.onModuleInit();
    scope.wago = new WagoService(scope.context);
    scope.commissioning = new WagoCommissioningService(scope.context, scope.wago, scope.artifacts);
    scope.commissioning['run'] = jest.fn(async () => '');
    scope.commissioning['copyTo'] = jest.fn(async () => undefined);
    await scope.mountApi();
    expect(await scope.rotationRecord(controller.id)).toEqual(pending);
    expect(await scope.rows('credential_rotation')).toEqual(failedEvidence);
    // Broker credentials have already changed: recovery remains possible without fresh runtime liveness.
    await scope.db
      .getRepository(WagoController)
      .update(controller.id, { lastHeartbeatAt: new Date(Date.now() - 91_000).toISOString() });
    scope.mqtt.publish.mockImplementation(async (_serverId, topic, payload) => {
      const packet = JSON.parse(String(payload));
      expect(packet).toMatchObject({
        token: firstPacket.token,
        revision: firstPacket.revision,
        credentialEpoch: firstPacket.credentialEpoch,
        password: scope.privateValue,
      });
      await scope.mqtt.receive(`${topic}/ack`, { ...packet, status: 'reconnected' });
    });
    await scope.post(`controllers/${controller.id}/credentials/rotate`, { confirm: true, retry: true }).expect(201, {
      state: 'completed',
      revision: 1,
    });
    expect(rotate).toHaveBeenCalledTimes(1);
    expect((await scope.rotationRecord(controller.id)).encryptedCredentials).toBeNull();
    const evidence = await scope.rows('credential_rotation');
    expect(evidence.map((row) => row.outcome)).toEqual(['attempted', 'failed', 'attempted', 'succeeded']);
    expect(evidence[2].operationId).toBe(evidence[3].operationId);
    expect(evidence[2].operationId).not.toBe(evidence[0].operationId);
    expect(JSON.stringify(evidence)).not.toContain(scope.privateValue);
    expect(JSON.stringify(evidence)).not.toContain(pending.token);
  });
}

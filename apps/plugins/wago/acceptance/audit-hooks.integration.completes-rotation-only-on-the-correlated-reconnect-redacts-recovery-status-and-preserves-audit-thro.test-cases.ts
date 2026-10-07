import httpRequest from 'supertest';
import { WagoController } from '../backend/wago-controller.entity';
import { WagoCredentialRotationEntity } from '../backend/wago-credential-rotation.entity';
import type { ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope } from './audit-hooks.integration.spec';
export function registerCompletesRotationOnlyOnTheCorrelatedReconnectRedactsRecoveryStatusAndPreservesAuditThro(
  scope: ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope,
): void {
  it('completes rotation only on the correlated reconnect, redacts recovery status and preserves audit through original-broker removal', async () => {
    const controller = await scope.deliverAndClaim();
    await scope.rotationReady(controller);
    const rotate = scope.observeRotationProvider();
    let dispatched!: (message: {
      topic: string;
      ack: { credentialEpoch: string; revision: number; token: string; status: string };
    }) => void;
    const dispatch = new Promise<Parameters<typeof dispatched>[0]>((resolve) => {
      dispatched = resolve;
    });
    scope.mqtt.publish.mockImplementation(async (serverId, topic, payload, options) => {
      expect(serverId).toBe(1);
      expect(options).toEqual({ qos: 1, retain: false });
      expect(topic).toBe(`attraccess/wago/v1/controllers/${controller.hardwareId}/credentials/rotate`);
      const packet = JSON.parse(String(payload));
      const pending = await scope.rotationRecord(controller.id);
      expect(pending.phase).toBe('pending');
      expect(pending.encryptedCredentials).not.toContain(scope.privateValue);
      expect(JSON.parse(scope.context.secrets.decrypt(pending.encryptedCredentials))).toEqual({
        username: `wago-controller-${controller.hardwareId}`,
        password: scope.privateValue,
      });
      const ack = {
        credentialEpoch: packet.credentialEpoch,
        revision: packet.revision,
        token: packet.token,
        status: 'reconnected',
      };
      dispatched({ topic, ack });
    });
    let settled = false;
    const response = scope
      .post(`controllers/${controller.id}/credentials/rotate`, { confirm: true })
      .expect(201)
      .then((value) => {
        settled = true;
        return value;
      });
    const { topic, ack } = await dispatch;
    for (const invalid of [
      { token: 'unrelated' },
      { credentialEpoch: 'old-enrollment' },
      { revision: ack.revision + 1 },
      { status: 'persisted' },
    ]) {
      await scope.mqtt.receive(`${topic}/ack`, { ...ack, ...invalid });
      // Publication has resolved: invalid replies must not settle the waiting HTTP operation.
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(settled).toBe(false);
      expect((await scope.rotationRecord(controller.id)).phase).toBe('pending');
      expect(await scope.rows('credential_rotation')).toHaveLength(1);
    }
    await scope.mqtt.receive(`${topic}/ack`, ack);
    const { body } = await response;
    expect(body).toEqual({ state: 'completed', revision: 1 });
    const completed = await scope.rotationRecord(controller.id);
    expect(completed).toMatchObject({
      phase: 'completed',
      encryptedCredentials: null,
      credentialEpoch: controller.credentialEpoch,
    });
    const evidence = await scope.lifecycle('credential_rotation', controller.id);
    expect(JSON.stringify(evidence)).not.toContain(scope.privateValue);
    expect(JSON.stringify(evidence)).not.toContain(completed.token);
    const status = await httpRequest(scope.app.getHttpServer())
      .get(`/wago/controllers/${controller.id}/credentials/rotation`)
      .set('Authorization', 'Bearer fixture-token')
      .expect(200);
    expect(status.body).toEqual(body);
    await scope
      .post(`controllers/${controller.id}/credentials/rotate`, { confirm: true, retry: true })
      .expect(201, body);
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(await scope.rows('credential_rotation')).toHaveLength(2);
    // Discovery broker changes must not redirect revocation of the original credential identity.
    await scope.db.getRepository(WagoController).update(controller.id, { mqttServerId: 2 });
    scope.revoke.mockClear();
    await scope.remove(controller.id).expect(200);
    expect(scope.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ mqttServerId: 1, identity: `wago-controller-${controller.hardwareId}` }),
    );
    expect(await scope.db.getRepository(WagoCredentialRotationEntity).count()).toBe(0);
    expect(await scope.rows('credential_rotation')).toEqual(evidence);
    await scope.lifecycle('unclaim', controller.id);
  }, 30_000);
}

import { AuditLog, Setting } from '@attraccess/database-entities';
import httpRequest from 'supertest';
import { AuditService } from '../../../api/src/audit/audit.service';
import { SettingsStoreService } from '../../../api/src/settings/settings-store.service';
import { WagoCommissioningSession } from '../backend/commissioning/session.entity';
import { WagoCommissioningService } from '../backend/commissioning/service';
import { WagoConfigurationRevision } from '../backend/configuration/revision.entity';
import { WagoController } from '../backend/controllers/entity';
import { WagoCredentialRotationEntity } from '../backend/credentials/service';
import { WagoService } from '../backend/controllers/service';
import { AuditAfterAll } from './audit-hooks.integration-afterall.test-utils';
import { AuditAfterEach } from './audit-hooks.integration-aftereach.test-utils';
import { AuditBeforeAll } from './audit-hooks.integration-beforeall.test-utils';
import { AuditBeforeEach } from './audit-hooks.integration-beforeeach.test-utils';
import { AuditFixtureState } from './audit-hooks.integration-fixture.test-utils';
import { privateValue, snapshot, verifier } from './audit-hooks.integration-globals.test-utils';

describe('composed WAGO hooks through the host bridge and durable SQLite provider', () => {
  const state = new AuditFixtureState();
  beforeAll(() => AuditBeforeAll(state), 30_000);

  afterAll(() => AuditAfterAll(state));

  beforeEach(() => AuditBeforeEach(state));

  afterEach(() => AuditAfterEach(state));
  it('rejects rotation without permission, confirmation, a fresh operational heartbeat or a pinned session before broker mutation', async () => {
    const controller = await state.deliverAndClaim();
    const rotate = state.observeRotationProvider();
    const path = `controllers/${controller.id}/credentials/rotate`;
    await state.post(path, { confirm: true }, 'command-token').expect(403);
    await state.post(path, {}).expect(400);
    await state.post(path, { confirm: true, retry: 'yes' }).expect(400);
    // Successful discovery/claim alone cannot establish permanent runtime readiness.
    await state.post(path, { confirm: true }).expect(409);
    expect(
      JSON.parse((await state.db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).capabilities),
    ).not.toContain('credential-rotation-v1');
    await state.rotationReady(controller);
    await state.db
      .getRepository(WagoController)
      .update(controller.id, { lastHeartbeatAt: new Date(Date.now() - 91_000).toISOString() });
    await state.post(path, { confirm: true }).expect(409);
    await state.db.getRepository(WagoController).update(controller.id, { lastHeartbeatAt: new Date().toISOString() });
    await state.db.getRepository(WagoCommissioningSession).delete(state.session.id);
    await state.post(path, { confirm: true }).expect(409);
    expect(rotate).not.toHaveBeenCalled();
    expect(await state.rows('credential_rotation')).toHaveLength(0);
    expect(await state.db.getRepository(WagoCredentialRotationEntity).count()).toBe(0);
  });

  it('completes rotation only on the correlated reconnect, redacts recovery status and preserves audit through original-broker removal', async () => {
    const controller = await state.deliverAndClaim();
    await state.rotationReady(controller);
    const rotate = state.observeRotationProvider();
    let dispatched!: (message: {
      topic: string;
      ack: { credentialEpoch: string; revision: number; token: string; status: string };
    }) => void;
    const dispatch = new Promise<Parameters<typeof dispatched>[0]>((resolve) => {
      dispatched = resolve;
    });
    state.mqtt.publish.mockImplementation(async (serverId, topic, payload, options) => {
      expect(serverId).toBe(1);
      expect(options).toEqual({ qos: 1, retain: false });
      expect(topic).toBe(`attraccess/wago/v1/controllers/${controller.hardwareId}/credentials/rotate`);
      const packet = JSON.parse(String(payload));
      const pending = await state.rotationRecord(controller.id);
      expect(pending.phase).toBe('pending');
      expect(pending.encryptedCredentials).not.toContain(privateValue);
      expect(JSON.parse(state.context.secrets.decrypt(pending.encryptedCredentials))).toEqual({
        username: `wago-controller-${controller.hardwareId}`,
        password: privateValue,
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
    const response = state
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
      await state.mqtt.receive(`${topic}/ack`, { ...ack, ...invalid });
      // Publication has resolved: invalid replies must not settle the waiting HTTP operation.
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(settled).toBe(false);
      expect((await state.rotationRecord(controller.id)).phase).toBe('pending');
      expect(await state.rows('credential_rotation')).toHaveLength(1);
    }
    await state.mqtt.receive(`${topic}/ack`, ack);
    const { body } = await response;
    expect(body).toEqual({ state: 'completed', revision: 1 });
    const completed = await state.rotationRecord(controller.id);
    expect(completed).toMatchObject({
      phase: 'completed',
      encryptedCredentials: null,
      credentialEpoch: controller.credentialEpoch,
    });
    const evidence = await state.lifecycle('credential_rotation', controller.id);
    expect(JSON.stringify(evidence)).not.toContain(privateValue);
    expect(JSON.stringify(evidence)).not.toContain(completed.token);
    const status = await httpRequest(state.app.getHttpServer())
      .get(`/wago/controllers/${controller.id}/credentials/rotation`)
      .set('Authorization', 'Bearer fixture-token')
      .expect(200);
    expect(status.body).toEqual(body);
    await state
      .post(`controllers/${controller.id}/credentials/rotate`, { confirm: true, retry: true })
      .expect(201, body);
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(await state.rows('credential_rotation')).toHaveLength(2);
    // Discovery broker changes must not redirect revocation of the original credential identity.
    await state.db.getRepository(WagoController).update(controller.id, { mqttServerId: 2 });
    state.revoke.mockClear();
    await state.remove(controller.id).expect(200);
    expect(state.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ mqttServerId: 1, identity: `wago-controller-${controller.hardwareId}` }),
    );
    expect(await state.db.getRepository(WagoCredentialRotationEntity).count()).toBe(0);
    expect(await state.rows('credential_rotation')).toEqual(evidence);
    await state.lifecycle('unclaim', controller.id);
  }, 30_000);

  it('reopens encrypted pending rotation and retries the same handoff', async () => {
    const controller = await state.deliverAndClaim();
    await state.rotationReady(controller);
    const rotate = state.observeRotationProvider();
    let firstPacket: Record<string, unknown>;
    state.mqtt.publish.mockImplementation(async (_serverId, _topic, payload) => {
      firstPacket = JSON.parse(String(payload));
      throw new Error(privateValue);
    });
    await state.post(`controllers/${controller.id}/credentials/rotate`, { confirm: true }).expect(409);
    const pending = await state.rotationRecord(controller.id);
    expect(pending).toMatchObject({ phase: 'pending', revision: 1 });
    expect(pending.encryptedCredentials).not.toContain(privateValue);
    const failedEvidence = await state.lifecycle('credential_rotation', controller.id, 'failed');
    await state.app.close();
    state.wago.onModuleDestroy();
    await state.audit.onModuleDestroy();
    await state.db.destroy();
    await state.db.initialize();
    state.audit = new AuditService(state.db, new SettingsStoreService(state.db.getRepository(Setting), null));
    await state.audit.onModuleInit();
    state.wago = new WagoService(state.context);
    state.commissioning = new WagoCommissioningService(state.context, state.wago, state.artifacts);
    state.commissioning['run'] = jest.fn(async () => '');
    state.commissioning['copyTo'] = jest.fn(async () => undefined);
    await state.mountApi();
    expect(await state.rotationRecord(controller.id)).toEqual(pending);
    expect(await state.rows('credential_rotation')).toEqual(failedEvidence);
    // Broker credentials have already changed: recovery remains possible without fresh runtime liveness.
    await state.db
      .getRepository(WagoController)
      .update(controller.id, { lastHeartbeatAt: new Date(Date.now() - 91_000).toISOString() });
    state.mqtt.publish.mockImplementation(async (_serverId, topic, payload) => {
      const packet = JSON.parse(String(payload));
      expect(packet).toMatchObject({
        token: firstPacket.token,
        revision: firstPacket.revision,
        credentialEpoch: firstPacket.credentialEpoch,
        password: privateValue,
      });
      await state.mqtt.receive(`${topic}/ack`, { ...packet, status: 'reconnected' });
    });
    await state.post(`controllers/${controller.id}/credentials/rotate`, { confirm: true, retry: true }).expect(201, {
      state: 'completed',
      revision: 1,
    });
    expect(rotate).toHaveBeenCalledTimes(1);
    expect((await state.rotationRecord(controller.id)).encryptedCredentials).toBeNull();
    const evidence = await state.rows('credential_rotation');
    expect(evidence.map((row) => row.outcome)).toEqual(['attempted', 'failed', 'attempted', 'succeeded']);
    expect(evidence[2].operationId).toBe(evidence[3].operationId);
    expect(evidence[2].operationId).not.toBe(evidence[0].operationId);
    expect(JSON.stringify(evidence)).not.toContain(privateValue);
    expect(JSON.stringify(evidence)).not.toContain(pending.token);
  });

  it('bounds a stalled rotation dispatch and retains encrypted recovery', async () => {
    const controller = await state.deliverAndClaim();
    await state.rotationReady(controller);
    const rotate = state.observeRotationProvider();
    state.mqtt.publish.mockImplementation(() => new Promise(() => undefined));
    const started = Date.now();
    await state.post(`controllers/${controller.id}/credentials/rotate`, { confirm: true }).expect(409);
    expect(Date.now() - started).toBeGreaterThanOrEqual(29_000);
    expect(Date.now() - started).toBeLessThan(40_000);
    expect(rotate).toHaveBeenCalledTimes(1);
    expect((await state.rotationRecord(controller.id)).phase).toBe('pending');
    expect((await state.rotationRecord(controller.id)).encryptedCredentials).not.toContain(privateValue);
    await state.lifecycle('credential_rotation', controller.id, 'failed');
  }, 45_000);

  it('rejects unauthenticated lifecycle requests before creating audit evidence', async () => {
    await httpRequest(state.app.getHttpServer())
      .post(`/wago/commissioning/sessions/${state.session.id}/deliver`)
      .send({ confirmInstall: true, temporarySsh: { username: 'root', password: privateValue } })
      .expect(401);
    expect(await state.db.getRepository(AuditLog).count()).toBe(0);
    expect(jest.mocked(state.wago.createEnrollment)).not.toHaveBeenCalled();
  });

  it('persists initiating token identity through actual delivery and discovery automatic claim, then survives reopen', async () => {
    const controller = await state.deliverAndClaim();
    await state.lifecycle('commissioning.install', state.session.id);
    await state.lifecycle('claim', controller.id);
    await state.mqtt.announce(state.session.hardwareId, 'invalid-replay');
    expect(await state.rows('claim')).toHaveLength(2);
    const before = await state.db.getRepository(AuditLog).find({ order: { id: 'ASC' } });
    expect(JSON.stringify(before)).not.toContain(privateValue);
    expect(JSON.stringify(before)).not.toContain(verifier);
    expect(JSON.stringify(before)).not.toContain('WAGO_ENROLLMENT_SECRET');
    state.wago.onModuleDestroy();
    await state.audit.onModuleDestroy();
    await state.db.destroy();
    await state.db.initialize();
    state.audit = new AuditService(state.db, new SettingsStoreService(state.db.getRepository(Setting), null));
    await state.audit.onModuleInit();
    expect(await state.db.getRepository(AuditLog).find({ order: { id: 'ASC' } })).toEqual(before);
    expect((await state.audit.list({ limit: 100 })).items).toHaveLength(4);
  });

  it('persists publication, forced publication, rollback and idempotent rejection acknowledgement revisions', async () => {
    const controller = await state.deliverAndClaim();
    const first = await state.saveAndPublish(controller.id);
    await state.lifecycle('publication', controller.id, 'succeeded', { revision: first.revision });
    const forced = await state.saveAndPublish(controller.id, { ...snapshot, logicalChannels: [] }, true);
    await state.lifecycle('forced_publication', controller.id, 'succeeded', { revision: forced.revision });
    const { body: preview } = await httpRequest(state.app.getHttpServer())
      .get(`/wago/controllers/${controller.id}/configuration/revisions/${first.revision}/preview`)
      .set('Authorization', 'Bearer fixture-token')
      .expect(200);
    const { body: restored } = await state
      .post(`controllers/${controller.id}/configuration/rollback/${first.revision}`, {
        force: true,
        sourceHash: preview.revision.contentHash,
        currentHash: preview.current?.contentHash ?? null,
        draftHash: preview.draftHash,
      })
      .expect(201);
    await state.lifecycle('rollback', controller.id, 'succeeded', {
      sourceRevision: first.revision,
      revision: restored.revision,
    });
    // Feed the device report into the real report handler; reception itself is not an operator audit event.
    await state.wago['onConfigurationReported'](
      controller.id,
      Buffer.from(
        JSON.stringify({
          protocolVersion: 1,
          revision: restored.revision,
          contentHash: restored.contentHash,
          errors: [{ path: '$', code: 'fixture_rejected', message: privateValue }],
        }),
      ),
    );
    const rejected = await state.db
      .getRepository(WagoConfigurationRevision)
      .findOneByOrFail({ controllerId: controller.id, revision: restored.revision });
    expect(rejected.state).toBe('rejected');
    expect(await state.rows('rejection_acknowledgement')).toHaveLength(0);
    const expected = { contentHash: rejected.contentHash, reportedAt: rejected.reportedAt };
    await state
      .post(`controllers/${controller.id}/configuration/revisions/${rejected.revision}/acknowledge-rejection`, expected)
      .expect(201);
    await state
      .post(`controllers/${controller.id}/configuration/revisions/${rejected.revision}/acknowledge-rejection`, expected)
      .expect(201);
    await state.lifecycle('rejection_acknowledgement', controller.id, 'succeeded', { revision: rejected.revision });
    expect(
      (await state.db.getRepository(WagoConfigurationRevision).findOneByOrFail({ id: rejected.id }))
        .rejectionAcknowledgedBy,
    ).toBe(42);
    expect(await state.rows('publication')).toHaveLength(2); // Rollback must not nest publication lifecycles.
    expect(JSON.stringify(await state.db.getRepository(AuditLog).find())).not.toContain(privateValue);
  });

  it('records exactly one unclaim and retains success after session cleanup fails', async () => {
    const controller = await state.deliverAndClaim();
    const original = state.audit.record.bind(state.audit);
    jest.spyOn(state.audit, 'record').mockImplementation(async (event) => {
      if (event.action === 'wago.unclaim') {
        const persisted = await state.db.getRepository(WagoController).findOneBy({ id: controller.id });
        expect(Boolean(persisted)).toBe(event.outcome === 'attempted');
      }
      return original(event);
    });
    // Actual removal succeeds; the subsequent commissioning history write fails.
    await state.db.query(
      "CREATE TRIGGER fixture_cleanup_failure BEFORE UPDATE ON plugin_wago_commissioning_sessions WHEN NEW.state = 'revoked' BEGIN SELECT RAISE(ABORT, 'fixture cleanup failed'); END",
    );
    await state.remove(controller.id).expect(500);
    await state.lifecycle('unclaim', controller.id);
    expect(await state.db.getRepository(WagoController).findOneBy({ id: controller.id })).toBeNull();
  });

  it('records failed unclaim on credential revocation failure without deleting the controller', async () => {
    const controller = await state.deliverAndClaim();
    state.revoke.mockRejectedValueOnce(new Error(privateValue));
    await state.remove(controller.id).expect(500);
    await state.lifecycle('unclaim', controller.id, 'failed');
    expect(await state.db.getRepository(WagoController).findOneBy({ id: controller.id })).not.toBeNull();
    expect(JSON.stringify(await state.rows('unclaim'))).not.toContain(privateValue);
  });

  it('retains failed publication evidence after allocation without recording transport errors', async () => {
    const controller = await state.deliverAndClaim();
    await state.post(`controllers/${controller.id}/configuration/draft`, { snapshot: snapshot }).expect(201);
    const { body: review } = await state.post(`controllers/${controller.id}/configuration/review`).expect(201);
    state.mqtt.publish.mockRejectedValueOnce(new Error(privateValue));
    await state
      .post(`controllers/${controller.id}/configuration/publish`, { reviewedHash: review.contentHash })
      .expect(500);
    const revision = await state.db
      .getRepository(WagoConfigurationRevision)
      .findOneByOrFail({ controllerId: controller.id });
    expect(revision).toMatchObject({ revision: 1, state: 'pending' });
    const records = await state.rows('publication');
    expect(records.map((row) => row.outcome)).toEqual(['attempted', 'failed']);
    expect(records[0].operationId).toBe(records[1].operationId);
    expect(JSON.stringify(records)).not.toContain(privateValue);
    expect(records[1].details).toEqual({ revision: revision.revision });
  });

  it('retains source and allocated revision on rollback dispatch failure without duplicate publication events', async () => {
    const controller = await state.deliverAndClaim();
    const source = await state.saveAndPublish(controller.id);
    const { body: preview } = await httpRequest(state.app.getHttpServer())
      .get(`/wago/controllers/${controller.id}/configuration/revisions/${source.revision}/preview`)
      .set('Authorization', 'Bearer fixture-token')
      .expect(200);
    state.mqtt.publish.mockRejectedValueOnce(new Error(privateValue));
    await state
      .post(`controllers/${controller.id}/configuration/rollback/${source.revision}`, {
        force: true,
        sourceHash: source.contentHash,
        currentHash: preview.current?.contentHash ?? null,
        draftHash: preview.draftHash,
      })
      .expect(500);
    const pending = await state.db
      .getRepository(WagoConfigurationRevision)
      .findOneByOrFail({ controllerId: controller.id, state: 'pending' });
    expect(pending.revision).toBe(source.revision + 1);
    await state.lifecycle('rollback', controller.id, 'failed', {
      sourceRevision: source.revision,
      revision: pending.revision,
    });
    expect(await state.rows('publication')).toHaveLength(2);
    expect(await state.rows('forced_publication')).toHaveLength(0);
    expect(JSON.stringify(await state.rows('rollback'))).not.toContain(privateValue);
  });

  it('retains the reused pending revision on repeated forced-publication dispatch failure', async () => {
    const controller = await state.deliverAndClaim();
    await state.post(`controllers/${controller.id}/configuration/draft`, { snapshot: snapshot }).expect(201);
    await state.post(`controllers/${controller.id}/configuration/review`).expect(201);
    state.mqtt.publish.mockRejectedValue(new Error(privateValue));
    await state.post(`controllers/${controller.id}/configuration/publish`, { force: true }).expect(500);
    await state.post(`controllers/${controller.id}/configuration/review`).expect(201);
    await state.post(`controllers/${controller.id}/configuration/publish`, { force: true }).expect(500);
    const revisions = await state.db
      .getRepository(WagoConfigurationRevision)
      .find({ where: { controllerId: controller.id } });
    expect(revisions).toHaveLength(1);
    const records = await state.rows('forced_publication');
    expect(records.map((row) => row.outcome)).toEqual(['attempted', 'failed', 'attempted', 'failed']);
    expect(records[1].details).toEqual({ revision: revisions[0].revision });
    expect(records[3].details).toEqual({ revision: revisions[0].revision });
    expect(records[0].operationId).toBe(records[1].operationId);
    expect(records[2].operationId).toBe(records[3].operationId);
    expect(records[0].operationId).not.toBe(records[2].operationId);
  });

  it.each(['accepted', 'rejected', 'transport_failure', 'timeout', 'stalled_dispatch', 'shutdown'] as const)(
    'persists an authenticated manual command with its real dispatched UUID and %s result',
    async (status) => {
      const controller = await state.deliverAndClaim();
      const revision = await state.saveAndPublish(controller.id);
      await state.wago['onConfigurationReported'](
        controller.id,
        Buffer.from(JSON.stringify({ revision: revision.revision, contentHash: revision.contentHash })),
      );
      let commandId: string;
      state.mqtt.publish.mockImplementation(async (_server, topic, payload) => {
        if (!topic.endsWith('/commands')) return;
        const command = JSON.parse(payload.toString());
        commandId = command.id;
        expect((await state.rows('manual_command')).map((row) => row.outcome)).toEqual(['attempted']);
        expect((await state.rows('manual_command'))[0].details).toEqual({
          commandId,
          channelId: 'output',
          operation: 'set',
        });
        if (status === 'transport_failure') throw new Error(privateValue);
        if (status === 'timeout') return;
        if (status === 'stalled_dispatch') return new Promise<void>(() => undefined);
        if (status === 'shutdown') {
          state.wago.onModuleDestroy();
          return;
        }
        const acknowledgement = { id: commandId, status, message: privateValue };
        await state.mqtt.receive(`attraccess/wago/v1/controllers/other-controller/acknowledgements`, acknowledgement);
        expect(await state.rows('manual_command')).toHaveLength(1);
        await state.mqtt.receive(
          `attraccess/wago/v1/controllers/${controller.hardwareId}/acknowledgements`,
          acknowledgement,
        );
      });
      const { body: result } = await state
        .post(
          `controllers/${controller.id}/commands`,
          {
            channelId: 'output',
            action: 'set',
            value: true,
            expectedConfigurationRevision: revision.revision,
            acknowledgementTimeoutSeconds: 1,
          },
          'command-token',
        )
        .expect(201);
      const expectedResult =
        status === 'accepted'
          ? 'acknowledged'
          : status === 'stalled_dispatch'
            ? 'timeout'
            : status === 'shutdown'
              ? 'transport_failure'
              : status;
      expect(result).toEqual({ commandId, channelId: 'output', operation: 'set', result: expectedResult });
      expect(commandId).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
      await state.lifecycle('manual_command', controller.id, status === 'accepted' ? 'succeeded' : 'failed', result);
      await state.mqtt.receive(`attraccess/wago/v1/controllers/${controller.hardwareId}/acknowledgements`, {
        id: commandId,
        status: 'accepted',
      });
      expect(await state.rows('manual_command')).toHaveLength(2);
      expect(JSON.stringify(await state.rows('manual_command'))).not.toContain(privateValue);
      expect((await state.rows('manual_command'))[1].details).not.toHaveProperty('value');
    },
  );

  it('persists manual credential fallback only after matching acknowledgement through the authenticated API', async () => {
    const { controller, provision } = await state.manuallyEnrolledController();
    state.mqtt.publish.mockImplementation(async (_server, topic, payload) => {
      if (!topic.endsWith('/claim')) return;
      const credentials = JSON.parse(payload.toString());
      expect(credentials.password).toBe(privateValue);
      expect(Date.parse(credentials.expiresAt)).toBeGreaterThan(Date.now());
      expect(Date.parse(credentials.expiresAt)).toBeLessThanOrEqual(Date.now() + 30_000);
      expect((await state.rows('manual_credential_fallback')).map((row) => row.outcome)).toEqual(['attempted']);
      await state.mqtt.receive(`${topic}/ack`, { acknowledgementToken: 'incorrect-token' });
      expect(await state.rows('manual_credential_fallback')).toHaveLength(1);
      await state.mqtt.receive(`${topic}/ack`, { acknowledgementToken: credentials.acknowledgementToken });
    });
    const input = {
      name: 'Manual fixture',
      verifier: verifier,
      username: 'wago-controller-manual-fixture',
      password: privateValue,
    };
    await state.post(`controllers/${controller.id}/credentials/manual/complete`, input, 'command-token').expect(403);
    expect(await state.rows('manual_credential_fallback')).toHaveLength(0);
    await state.post(`controllers/${controller.id}/credentials/manual/complete`, input).expect(201, {
      controllerId: controller.id,
      result: 'acknowledged',
    });
    await state.lifecycle('manual_credential_fallback', controller.id);
    expect(provision).not.toHaveBeenCalled();
    expect((await state.db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe(
      'claimed',
    );
    expect(JSON.stringify(await state.rows('manual_credential_fallback'))).not.toContain(privateValue);
  });

  it('persists failed manual fallback with no credential dispatch when the physical verifier is wrong', async () => {
    const { controller, provision } = await state.manuallyEnrolledController();
    state.mqtt.publish.mockClear();
    await state
      .post(`controllers/${controller.id}/credentials/manual/complete`, {
        name: 'Manual fixture',
        verifier: 'incorrect-verifier',
        username: 'wago-controller-manual-fixture',
        password: privateValue,
      })
      .expect(409);
    await state.lifecycle('manual_credential_fallback', controller.id, 'failed');
    expect(provision).not.toHaveBeenCalled();
    expect(state.mqtt.publish).not.toHaveBeenCalled();
    expect((await state.db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe(
      'untrusted',
    );
    expect(JSON.stringify(await state.rows('manual_credential_fallback'))).not.toContain(privateValue);
  });

  it('preserves acknowledged credentials when the later publish receipt fails', async () => {
    const { controller, provision } = await state.manuallyEnrolledController();
    // Associate the manually enrolled controller with a real pinned commissioning session.
    await state.db.getRepository(WagoCommissioningSession).update(state.session.id, {
      hardwareId: controller.hardwareId,
    });
    state.mqtt.publish.mockImplementation(async (_server, topic, payload) => {
      if (!topic.endsWith('/claim')) return;
      const credentials = JSON.parse(payload.toString());
      await state.mqtt.receive(`${topic}/ack`, { acknowledgementToken: credentials.acknowledgementToken });
      throw new Error(privateValue);
    });
    await state
      .post(`controllers/${controller.id}/credentials/manual/complete`, {
        name: 'Manual fixture',
        verifier: verifier,
        username: 'wago-controller-manual-fixture',
        password: privateValue,
      })
      .expect(409);
    await state.lifecycle('manual_credential_fallback', controller.id, 'failed');
    expect(provision).not.toHaveBeenCalled();
    expect(state.revoke.mock.calls).not.toContainEqual([
      expect.objectContaining({ identity: 'wago-controller-manual-fixture' }),
    ]);
    expect((await state.db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe(
      'claimed',
    );
    expect(JSON.stringify(await state.rows('manual_credential_fallback'))).not.toContain(privateValue);
  });

  it('rejects a manual handoff to a runtime without expiry support before dispatch or audit admission', async () => {
    const { controller } = await state.manuallyEnrolledController();
    await state.db
      .getRepository(WagoController)
      .update(controller.id, { capabilities: '["claim","configuration-v1"]' });
    state.mqtt.publish.mockClear();
    await state
      .post(`controllers/${controller.id}/credentials/manual/complete`, {
        name: 'Manual fixture',
        verifier: verifier,
        username: 'wago-controller-manual-fixture',
        password: privateValue,
      })
      .expect(409);
    expect(state.mqtt.publish).not.toHaveBeenCalled();
    expect(await state.rows('manual_credential_fallback')).toHaveLength(0);
  });
});

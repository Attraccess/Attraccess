/* eslint-disable @nx/enforce-module-boundaries -- Integration fixture intentionally composes the host and real WAGO plugin sources. */
import { mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import httpRequest from 'supertest';
import cookieParser from 'cookie-parser';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { SessionService } from '../users-and-auth/auth/session.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';
import { WAGO_HARDWARE_PROFILE } from '../../../plugins/wago/backend/wago-hardware-deployment';
import { AuditLog, Setting, entities } from '@attraccess/database-entities';
import type { PluginContext, PluginMqttClient } from '@attraccess/plugins-backend-sdk';
import * as coreMigrations from '../database/migrations';
import { SettingsStoreService } from '../settings/settings-store.service';
import { createPluginAuditContext } from '../plugin-system/plugin-audit-context';
import { AuditService } from './audit.service';
import plugin from '../../../plugins/wago/backend/plugin';
import * as wagoMigrations from '../../../plugins/wago/backend/migrations';
import { WagoService } from '../../../plugins/wago/backend/wago.service';
import { WagoControllerApi } from '../../../plugins/wago/backend/wago.controller';
import { WagoController } from '../../../plugins/wago/backend/wago-controller.entity';
import { WagoCommissioningService } from '../../../plugins/wago/backend/wago-commissioning.service';
import { WagoCommissioningSession } from '../../../plugins/wago/backend/wago-commissioning-session.entity';
import { commissioningFingerprintHash } from '../../../plugins/wago/backend/wago-commissioning-lease';
import { WagoCommissioningLeaseEntity } from '../../../plugins/wago/backend/wago-commissioning-lease.entity';
import { WagoRuntimeArtifactsService } from '../../../plugins/wago/backend/wago-runtime-artifacts';
import { WagoConfigurationRevision } from '../../../plugins/wago/backend/wago-configuration-revision.entity';
import { discoveryTopic } from '../../../plugins/wago/backend/protocol';
import type { WagoConfigurationSnapshot } from '../../../plugins/wago/backend/configuration';

const pluginId = 'abcdefghijklmnopqrstu';
const principal = { userId: 42, authenticationMethod: 'api-token' as const, apiTokenId: 19 };
const verifier = 'v'.repeat(43);
const privateValue = 'fixture-only-password-never-audit';
const snapshot: WagoConfigurationSnapshot = {
  version: 1,
  physicalPoints: [{ id: 'point', hardwareProfile: '751-9301', channel: 0 }],
  logicalChannels: [
    {
      id: 'output',
      physicalPointId: 'point',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'immediate' },
    },
  ],
};

/** No sockets: only MQTT transport, credential provisioning and SSH transport are fixtures. */
class FixtureMqtt implements PluginMqttClient {
  readonly handlers = new Map<string, Set<Parameters<PluginMqttClient['subscribe']>[2]>>();
  readonly publish = jest.fn<ReturnType<PluginMqttClient['publish']>, Parameters<PluginMqttClient['publish']>>(
    async () => undefined,
  );
  async subscribe(_serverId: number, topic: string, handler: Parameters<PluginMqttClient['subscribe']>[2]) {
    const handlers = this.handlers.get(topic) ?? new Set();
    this.handlers.set(topic, handlers);
    handlers.add(handler);
    return {
      unsubscribe: () => {
        handlers.delete(handler);
      },
    };
  }
  async receive(topic: string, payload: object) {
    const parts = topic.split('/');
    for (const [filter, handlers] of this.handlers) {
      const expected = filter.split('/');
      if (expected.length !== parts.length || !expected.every((part, index) => part === '+' || part === parts[index]))
        continue;
      for (const handler of [...handlers])
        await handler({ serverId: 1, topic, payload: Buffer.from(JSON.stringify(payload)) });
    }
  }
  async announce(hardwareId: string, enrollmentSecret: string) {
    const handlers = [...(this.handlers.get('attraccess/wago/discovery/+') ?? [])];
    expect(handlers).toHaveLength(1);
    for (const handler of handlers)
      await handler({
        serverId: 1,
        topic: discoveryTopic(hardwareId),
        payload: Buffer.from(
          JSON.stringify({
            hardwareId,
            pairingCode: verifier,
            enrollmentSecret,
            protocolVersion: '1.0.0',
            runtimeVersion: '0.1.0',
            capabilities: ['claim', 'claim-expiry-v1', 'heartbeat', 'configuration-v1'],
          }),
        ),
      });
  }
}

describe('composed WAGO hooks through the host bridge and durable SQLite provider', () => {
  let schemaDirectory: string;
  let directory: string;
  let db: DataSource;
  let audit: AuditService;
  let wago: WagoService;
  let commissioning: WagoCommissioningService;
  let app: INestApplication;
  let mqtt: FixtureMqtt;
  let context: PluginContext;
  let session: WagoCommissioningSession;
  const revoke = jest.fn(async () => undefined);

  beforeAll(async () => {
    schemaDirectory = await mkdtemp(join(tmpdir(), 'wago-audit-schema-'));
    const schema = await new DataSource({
      type: 'sqlite',
      database: join(schemaDirectory, 'schema.sqlite'),
      entities: [...Object.values(entities), ...plugin.entities],
      migrations: [...Object.values(coreMigrations), ...Object.values(wagoMigrations)],
      synchronize: false,
    }).initialize();
    try {
      await schema.runMigrations();
    } finally {
      await schema.destroy();
    }
  }, 30_000);

  afterAll(async () => {
    await rm(schemaDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'wago-audit-hooks-'));
    // Each case gets an independent copy of the fully migrated fixture schema.
    await copyFile(join(schemaDirectory, 'schema.sqlite'), join(directory, 'fixture.sqlite'));
    db = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'fixture.sqlite'),
      entities: [...Object.values(entities), ...plugin.entities],
      synchronize: false,
    }).initialize();
    audit = new AuditService(db, new SettingsStoreService(db.getRepository(Setting), null));
    await audit.onModuleInit();
    mqtt = new FixtureMqtt();
    revoke.mockReset().mockResolvedValue(undefined);
    const provision: ReturnType<PluginContext['getMqttCredentialProvisioning']>['provision'] = async (input) => ({
      ...input,
      providerId: 'fixture',
      password: privateValue,
    });
    context = {
      manifest: { id: pluginId, name: 'wago-fixture', version: '1.0.0', pluginDirectory: directory },
      dataSource: db,
      getRepository: (entity) => db.getRepository(entity),
      audit: createPluginAuditContext(pluginId, () => audit),
      mqtt,
      events: new EventEmitter2(),
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      get: () => {
        throw new Error('Unexpected fixture provider resolution');
      },
      onEvent: () => ({ off: () => undefined }),
      emitEvent: () => undefined,
      flows: { trigger: async () => undefined },
      secrets: { encrypt: () => 'fixture-ciphertext', decrypt: () => verifier },
      getMqttServerConfig: async () => ({
        id: 1,
        name: 'fixture',
        host: 'broker.example.test',
        port: 8883,
        useTls: true,
        username: 'fixture',
        password: privateValue,
        clientId: null,
      }),
      getMqttCredentialProvisioning: () => ({
        availableProviders: async () => [{ providerId: 'fixture', displayName: 'fixture' }],
        provision,
        rotate: provision,
        revoke,
      }),
    };
    wago = new WagoService(context);
    jest.spyOn(wago, 'createEnrollment');
    await wago.onApplicationBootstrap();
    const artifacts = new WagoRuntimeArtifactsService();
    jest.spyOn(artifacts, 'has').mockResolvedValue(true);
    const artifactDirectory = join(directory, 'artifact');
    await mkdir(artifactDirectory);
    const image = `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'a'.repeat(64)}`;
    jest.spyOn(artifacts, 'acquire').mockResolvedValue({
      digest: 'a'.repeat(64),
      bytes: 512,
      image,
      path: join(artifactDirectory, 'runtime.tar'),
      directory: artifactDirectory,
      cleanup: async () => undefined,
      manifest: {
        schemaVersion: 1,
        runtime: 'attraccess-wago-cc100',
        runtimeVersion: '0.1.0',
        protocolVersion: '1.0.0',
        image,
        hardware: {
          model: '751-9301',
          platform: 'linux/arm/v7',
          firmwareBaseline: '31',
          profile: WAGO_HARDWARE_PROFILE,
        },
      },
    });
    commissioning = new WagoCommissioningService(context, wago, artifacts);
    // Replace only transport boundaries; delivery, inspection, leases and automatic claim remain real.
    commissioning['run'] = jest.fn(async () => 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="31"\nCODESYS=\n');
    commissioning['copyTo'] = jest.fn(async () => undefined);
    await commissioning.onApplicationBootstrap();
    const module = await Test.createTestingModule({
      controllers: [WagoControllerApi],
      providers: [
        SessionStrategy,
        { provide: WagoService, useValue: wago },
        { provide: WagoCommissioningService, useValue: commissioning },
        { provide: Symbol.for('attraccess.plugin.context'), useValue: context },
        { provide: SessionService, useValue: { validateSession: async () => null } },
        { provide: TwoFactorService, useValue: { getStatus: async () => ({ required: false }) } },
        {
          provide: RbacService,
          useValue: {
            getEffectivePermissions: async () =>
              new Set(['resources.update', 'system.settings.manage', 'users.api-tokens.manage']),
          },
        },
        {
          provide: ApiTokenService,
          useValue: {
            authenticate: async (token: string) =>
              ['fixture-token', 'command-token'].includes(token)
                ? {
                    user: { id: principal.userId },
                    apiToken: {
                      id: principal.apiTokenId,
                      permissionKeys:
                        token === 'command-token'
                          ? ['resources.update']
                          : ['resources.update', 'system.settings.manage'],
                    },
                  }
                : null,
          },
        },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useLogger(false);
    await app.init();
    await app.listen(0, '127.0.0.1');
    session = await db.getRepository(WagoCommissioningSession).save({
      hardwareId: 'audit-fixture',
      mqttServerId: 1,
      targetHost: '10.99.0.1',
      hostKeyFingerprint: `SHA256:${'A'.repeat(43)}`,
      firmwareBaseline: '31',
      controllerName: 'Fixture',
      state: 'awaiting_delivery',
      pairingCode: 'encrypted:v1:fixture-ciphertext',
      auditLog: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtimeArtifactDigest: 'a'.repeat(64),
    });
  });

  afterEach(async () => {
    await app?.close();
    wago?.onModuleDestroy();
    await audit?.onModuleDestroy();
    if (db?.isInitialized) await db.destroy();
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function post(path: string, body: object = {}, token = 'fixture-token') {
    return httpRequest(app.getHttpServer()).post(`/wago/${path}`).set('Authorization', `Bearer ${token}`).send(body);
  }
  function remove(id: number) {
    return httpRequest(app.getHttpServer())
      .delete(`/wago/controllers/${id}`)
      .set('Authorization', 'Bearer fixture-token');
  }
  async function rows(action: string) {
    return db.getRepository(AuditLog).find({ where: { action: `wago.${action}` }, order: { id: 'ASC' } });
  }
  async function lifecycle(
    action: string,
    subjectId: number,
    outcome: 'succeeded' | 'failed' = 'succeeded',
    details: Record<string, string | number> = {},
  ) {
    const records = await rows(action);
    expect(records).toHaveLength(2);
    expect(records.map((row) => row.outcome)).toEqual(['attempted', outcome]);
    expect(records[0].operationId).toBe(records[1].operationId);
    for (const row of records)
      expect(row).toMatchObject({
        pluginId,
        actorId: 42,
        authenticationMethod: 'api-token',
        apiTokenId: 19,
        subjectId,
        subjectType: action.startsWith('commissioning.') ? 'wago.commissioning' : 'wago.controller',
      });
    expect(records[1].details).toEqual(details);
    return records;
  }
  async function deliverAndClaim() {
    const { body: delivered } = await post(`commissioning/sessions/${session.id}/deliver`, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: privateValue },
    }).expect(201);
    expect(delivered.state).toBe('awaiting_discovery');
    expect(delivered).not.toHaveProperty('initiatingPrincipal');
    expect(
      (await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: session.id })).initiatingPrincipal,
    ).toBe(JSON.stringify(principal));
    const enrollment = await db
      .getRepository('plugin_wago_enrollments')
      .findOneByOrFail({ id: delivered.enrollmentId });
    // Observe the actual enrollment result, without mocking its persistence or parsing generated shell source.
    const credentials = await jest.mocked(wago.createEnrollment).mock.results[0].value;
    expect(enrollment.id).toBe(credentials.id);
    await mqtt.announce(session.hardwareId, credentials.claimSecret);
    const controller = await db.getRepository(WagoController).findOneByOrFail({ hardwareId: session.hardwareId });
    expect(controller.trustState).toBe('claimed');
    return controller;
  }
  async function saveAndPublish(id: number, value = snapshot, force = false) {
    await post(`controllers/${id}/configuration/draft`, { snapshot: value }).expect(201);
    const { body: review } = await post(`controllers/${id}/configuration/review`).expect(201);
    return (
      await post(`controllers/${id}/configuration/publish`, { force, reviewedHash: review.contentHash }).expect(201)
    ).body;
  }

  it('rejects unauthenticated lifecycle requests before creating audit evidence', async () => {
    await httpRequest(app.getHttpServer())
      .post(`/wago/commissioning/sessions/${session.id}/deliver`)
      .send({ confirmInstall: true, temporarySsh: { username: 'root', password: privateValue } })
      .expect(401);
    expect(await db.getRepository(AuditLog).count()).toBe(0);
    expect(jest.mocked(wago.createEnrollment)).not.toHaveBeenCalled();
  });

  it('persists initiating token identity through actual delivery and discovery automatic claim, then survives reopen', async () => {
    const controller = await deliverAndClaim();
    await lifecycle('commissioning.install', session.id);
    await lifecycle('claim', controller.id);
    await mqtt.announce(session.hardwareId, 'invalid-replay');
    expect(await rows('claim')).toHaveLength(2);
    const before = await db.getRepository(AuditLog).find({ order: { id: 'ASC' } });
    expect(JSON.stringify(before)).not.toContain(privateValue);
    expect(JSON.stringify(before)).not.toContain(verifier);
    expect(JSON.stringify(before)).not.toContain('WAGO_ENROLLMENT_SECRET');
    wago.onModuleDestroy();
    await audit.onModuleDestroy();
    await db.destroy();
    await db.initialize();
    audit = new AuditService(db, new SettingsStoreService(db.getRepository(Setting), null));
    await audit.onModuleInit();
    expect(await db.getRepository(AuditLog).find({ order: { id: 'ASC' } })).toEqual(before);
    expect((await audit.list({ limit: 100 })).items).toHaveLength(4);
  });

  it('persists publication, forced publication, rollback and idempotent rejection acknowledgement revisions', async () => {
    const controller = await deliverAndClaim();
    const first = await saveAndPublish(controller.id);
    await lifecycle('publication', controller.id, 'succeeded', { revision: first.revision });
    const forced = await saveAndPublish(controller.id, { ...snapshot, logicalChannels: [] }, true);
    await lifecycle('forced_publication', controller.id, 'succeeded', { revision: forced.revision });
    const { body: preview } = await httpRequest(app.getHttpServer())
      .get(`/wago/controllers/${controller.id}/configuration/revisions/${first.revision}/preview`)
      .set('Authorization', 'Bearer fixture-token')
      .expect(200);
    const { body: restored } = await post(`controllers/${controller.id}/configuration/rollback/${first.revision}`, {
      force: true,
      sourceHash: preview.revision.contentHash,
      currentHash: preview.current?.contentHash ?? null,
      draftHash: preview.draftHash,
    }).expect(201);
    await lifecycle('rollback', controller.id, 'succeeded', {
      sourceRevision: first.revision,
      revision: restored.revision,
    });
    // Feed the device report into the real report handler; reception itself is not an operator audit event.
    await wago['onConfigurationReported'](
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
    const rejected = await db
      .getRepository(WagoConfigurationRevision)
      .findOneByOrFail({ controllerId: controller.id, revision: restored.revision });
    expect(rejected.state).toBe('rejected');
    expect(await rows('rejection_acknowledgement')).toHaveLength(0);
    const expected = { contentHash: rejected.contentHash, reportedAt: rejected.reportedAt };
    await post(
      `controllers/${controller.id}/configuration/revisions/${rejected.revision}/acknowledge-rejection`,
      expected,
    ).expect(201);
    await post(
      `controllers/${controller.id}/configuration/revisions/${rejected.revision}/acknowledge-rejection`,
      expected,
    ).expect(201);
    await lifecycle('rejection_acknowledgement', controller.id, 'succeeded', { revision: rejected.revision });
    expect(
      (await db.getRepository(WagoConfigurationRevision).findOneByOrFail({ id: rejected.id })).rejectionAcknowledgedBy,
    ).toBe(42);
    expect(await rows('publication')).toHaveLength(2); // Rollback must not nest publication lifecycles.
    expect(JSON.stringify(await db.getRepository(AuditLog).find())).not.toContain(privateValue);
  });

  it('records exactly one unclaim inside the live removal lease and retains success after session cleanup fails', async () => {
    const controller = await deliverAndClaim();
    const original = audit.record.bind(audit);
    jest.spyOn(audit, 'record').mockImplementation(async (event) => {
      if (event.action === 'wago.unclaim') {
        const leases = await db.getRepository(WagoCommissioningLeaseEntity).find();
        expect(leases).toHaveLength(1);
        expect(Number(leases[0].leaseUntil)).toBeGreaterThan(Date.now());
        const persisted = await db.getRepository(WagoController).findOneBy({ id: controller.id });
        expect(Boolean(persisted)).toBe(event.outcome === 'attempted');
      }
      return original(event);
    });
    // Actual removal succeeds; the subsequent commissioning history write fails.
    await db.query(
      "CREATE TRIGGER fixture_cleanup_failure BEFORE UPDATE ON plugin_wago_commissioning_sessions WHEN NEW.state = 'revoked' BEGIN SELECT RAISE(ABORT, 'fixture cleanup failed'); END",
    );
    await remove(controller.id).expect(500);
    await lifecycle('unclaim', controller.id);
    expect(await db.getRepository(WagoController).findOneBy({ id: controller.id })).toBeNull();
    expect(await db.getRepository(WagoCommissioningLeaseEntity).count()).toBe(0);
  });

  it('emits no unclaim when another owner holds the lease', async () => {
    const controller = await deliverAndClaim();
    await db.getRepository(WagoCommissioningLeaseEntity).insert({
      fingerprintHash: commissioningFingerprintHash(session.hostKeyFingerprint),
      owner: 'independent-fixture-worker',
      leaseUntil: Date.now() + 90_000,
      operationUntil: Date.now() + 120_000,
      recoveryAfter: Date.now() + 150_000,
    });
    await remove(controller.id).expect(409);
    expect(await rows('unclaim')).toHaveLength(0);
    expect(await db.getRepository(WagoController).findOneBy({ id: controller.id })).not.toBeNull();
  });

  it('records failed unclaim on credential revocation failure without deleting the controller', async () => {
    const controller = await deliverAndClaim();
    revoke.mockRejectedValueOnce(new Error(privateValue));
    await remove(controller.id).expect(500);
    await lifecycle('unclaim', controller.id, 'failed');
    expect(await db.getRepository(WagoController).findOneBy({ id: controller.id })).not.toBeNull();
    expect(JSON.stringify(await rows('unclaim'))).not.toContain(privateValue);
  });

  it('retains failed publication evidence after allocation without recording transport errors', async () => {
    const controller = await deliverAndClaim();
    await post(`controllers/${controller.id}/configuration/draft`, { snapshot }).expect(201);
    const { body: review } = await post(`controllers/${controller.id}/configuration/review`).expect(201);
    mqtt.publish.mockRejectedValueOnce(new Error(privateValue));
    await post(`controllers/${controller.id}/configuration/publish`, { reviewedHash: review.contentHash }).expect(500);
    const revision = await db.getRepository(WagoConfigurationRevision).findOneByOrFail({ controllerId: controller.id });
    expect(revision).toMatchObject({ revision: 1, state: 'pending' });
    const records = await rows('publication');
    expect(records.map((row) => row.outcome)).toEqual(['attempted', 'failed']);
    expect(records[0].operationId).toBe(records[1].operationId);
    expect(JSON.stringify(records)).not.toContain(privateValue);
    expect(records[1].details).toEqual({ revision: revision.revision });
  });

  it('retains source and allocated revision on rollback dispatch failure without duplicate publication events', async () => {
    const controller = await deliverAndClaim();
    const source = await saveAndPublish(controller.id);
    const { body: preview } = await httpRequest(app.getHttpServer())
      .get(`/wago/controllers/${controller.id}/configuration/revisions/${source.revision}/preview`)
      .set('Authorization', 'Bearer fixture-token')
      .expect(200);
    mqtt.publish.mockRejectedValueOnce(new Error(privateValue));
    await post(`controllers/${controller.id}/configuration/rollback/${source.revision}`, {
      force: true,
      sourceHash: source.contentHash,
      currentHash: preview.current?.contentHash ?? null,
      draftHash: preview.draftHash,
    }).expect(500);
    const pending = await db
      .getRepository(WagoConfigurationRevision)
      .findOneByOrFail({ controllerId: controller.id, state: 'pending' });
    expect(pending.revision).toBe(source.revision + 1);
    await lifecycle('rollback', controller.id, 'failed', {
      sourceRevision: source.revision,
      revision: pending.revision,
    });
    expect(await rows('publication')).toHaveLength(2);
    expect(await rows('forced_publication')).toHaveLength(0);
    expect(JSON.stringify(await rows('rollback'))).not.toContain(privateValue);
  });

  it('retains the reused pending revision on repeated forced-publication dispatch failure', async () => {
    const controller = await deliverAndClaim();
    await post(`controllers/${controller.id}/configuration/draft`, { snapshot }).expect(201);
    await post(`controllers/${controller.id}/configuration/review`).expect(201);
    mqtt.publish.mockRejectedValue(new Error(privateValue));
    await post(`controllers/${controller.id}/configuration/publish`, { force: true }).expect(500);
    await post(`controllers/${controller.id}/configuration/review`).expect(201);
    await post(`controllers/${controller.id}/configuration/publish`, { force: true }).expect(500);
    const revisions = await db
      .getRepository(WagoConfigurationRevision)
      .find({ where: { controllerId: controller.id } });
    expect(revisions).toHaveLength(1);
    const records = await rows('forced_publication');
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
      const controller = await deliverAndClaim();
      const revision = await saveAndPublish(controller.id);
      await wago['onConfigurationReported'](
        controller.id,
        Buffer.from(JSON.stringify({ revision: revision.revision, contentHash: revision.contentHash })),
      );
      let commandId: string;
      mqtt.publish.mockImplementation(async (_server, topic, payload) => {
        if (!topic.endsWith('/commands')) return;
        const command = JSON.parse(payload.toString());
        commandId = command.id;
        expect((await rows('manual_command')).map((row) => row.outcome)).toEqual(['attempted']);
        expect((await rows('manual_command'))[0].details).toEqual({ commandId, channelId: 'output', operation: 'set' });
        if (status === 'transport_failure') throw new Error(privateValue);
        if (status === 'timeout') return;
        if (status === 'stalled_dispatch') return new Promise<void>(() => undefined);
        if (status === 'shutdown') {
          wago.onModuleDestroy();
          return;
        }
        const acknowledgement = { id: commandId, status, message: privateValue };
        await mqtt.receive(`attraccess/wago/v1/controllers/other-controller/acknowledgements`, acknowledgement);
        expect(await rows('manual_command')).toHaveLength(1);
        await mqtt.receive(`attraccess/wago/v1/controllers/${controller.hardwareId}/acknowledgements`, acknowledgement);
      });
      const { body: result } = await post(
        `controllers/${controller.id}/commands`,
        {
          channelId: 'output',
          action: 'set',
          value: true,
          expectedConfigurationRevision: revision.revision,
          acknowledgementTimeoutSeconds: 1,
        },
        'command-token',
      ).expect(201);
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
      await lifecycle('manual_command', controller.id, status === 'accepted' ? 'succeeded' : 'failed', result);
      await mqtt.receive(`attraccess/wago/v1/controllers/${controller.hardwareId}/acknowledgements`, {
        id: commandId,
        status: 'accepted',
      });
      expect(await rows('manual_command')).toHaveLength(2);
      expect(JSON.stringify(await rows('manual_command'))).not.toContain(privateValue);
      expect((await rows('manual_command'))[1].details).not.toHaveProperty('value');
    },
  );

  async function manuallyEnrolledController() {
    const enrollment = await wago.createEnrollment('manual-fixture', 1);
    await mqtt.announce('manual-fixture', enrollment.claimSecret);
    const controller = await db.getRepository(WagoController).findOneByOrFail({ hardwareId: 'manual-fixture' });
    expect(controller.trustState).toBe('untrusted');
    const provisioner = context.getMqttCredentialProvisioning();
    const provision = jest.fn(provisioner.provision);
    jest
      .spyOn(context, 'getMqttCredentialProvisioning')
      .mockReturnValue({ ...provisioner, availableProviders: async () => [], provision });
    return { controller, provision };
  }

  it('persists manual credential fallback only after matching acknowledgement through the authenticated API', async () => {
    const { controller, provision } = await manuallyEnrolledController();
    mqtt.publish.mockImplementation(async (_server, topic, payload) => {
      if (!topic.endsWith('/claim')) return;
      const credentials = JSON.parse(payload.toString());
      expect(credentials.password).toBe(privateValue);
      expect(Date.parse(credentials.expiresAt)).toBeGreaterThan(Date.now());
      expect(Date.parse(credentials.expiresAt)).toBeLessThanOrEqual(Date.now() + 30_000);
      expect((await rows('manual_credential_fallback')).map((row) => row.outcome)).toEqual(['attempted']);
      await mqtt.receive(`${topic}/ack`, { acknowledgementToken: 'incorrect-token' });
      expect(await rows('manual_credential_fallback')).toHaveLength(1);
      await mqtt.receive(`${topic}/ack`, { acknowledgementToken: credentials.acknowledgementToken });
    });
    const input = {
      name: 'Manual fixture',
      verifier,
      username: 'wago-controller-manual-fixture',
      password: privateValue,
    };
    await post(`controllers/${controller.id}/credentials/manual/complete`, input, 'command-token').expect(403);
    expect(await rows('manual_credential_fallback')).toHaveLength(0);
    await post(`controllers/${controller.id}/credentials/manual/complete`, input).expect(201, {
      controllerId: controller.id,
      result: 'acknowledged',
    });
    await lifecycle('manual_credential_fallback', controller.id);
    expect(provision).not.toHaveBeenCalled();
    expect((await db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe('claimed');
    expect(JSON.stringify(await rows('manual_credential_fallback'))).not.toContain(privateValue);
  });

  it('persists failed manual fallback with no credential dispatch when the physical verifier is wrong', async () => {
    const { controller, provision } = await manuallyEnrolledController();
    mqtt.publish.mockClear();
    await post(`controllers/${controller.id}/credentials/manual/complete`, {
      name: 'Manual fixture',
      verifier: 'incorrect-verifier',
      username: 'wago-controller-manual-fixture',
      password: privateValue,
    }).expect(409);
    await lifecycle('manual_credential_fallback', controller.id, 'failed');
    expect(provision).not.toHaveBeenCalled();
    expect(mqtt.publish).not.toHaveBeenCalled();
    expect((await db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe(
      'untrusted',
    );
    expect(JSON.stringify(await rows('manual_credential_fallback'))).not.toContain(privateValue);
  });

  it('preserves acknowledged credentials and the durable recovery lease when the later publish receipt fails', async () => {
    const { controller, provision } = await manuallyEnrolledController();
    // Associate the manually enrolled controller with a real pinned commissioning session.
    await db.getRepository(WagoCommissioningSession).update(session.id, {
      hardwareId: controller.hardwareId,
    });
    mqtt.publish.mockImplementation(async (_server, topic, payload) => {
      if (!topic.endsWith('/claim')) return;
      const credentials = JSON.parse(payload.toString());
      await mqtt.receive(`${topic}/ack`, { acknowledgementToken: credentials.acknowledgementToken });
      throw new Error(privateValue);
    });
    await post(`controllers/${controller.id}/credentials/manual/complete`, {
      name: 'Manual fixture',
      verifier,
      username: 'wago-controller-manual-fixture',
      password: privateValue,
    }).expect(409);
    await lifecycle('manual_credential_fallback', controller.id, 'failed');
    expect(provision).not.toHaveBeenCalled();
    expect(revoke.mock.calls).not.toContainEqual([
      expect.objectContaining({ identity: 'wago-controller-manual-fixture' }),
    ]);
    expect((await db.getRepository(WagoController).findOneByOrFail({ id: controller.id })).trustState).toBe('claimed');
    const leases = await db.getRepository(WagoCommissioningLeaseEntity).find();
    expect(leases).toHaveLength(1);
    expect(leases[0].fingerprintHash).toBe(commissioningFingerprintHash(session.hostKeyFingerprint));
    await remove(controller.id).expect(409);
    expect(await rows('unclaim')).toHaveLength(0);
    expect(JSON.stringify(await rows('manual_credential_fallback'))).not.toContain(privateValue);
  });

  it('rejects a manual handoff to a runtime without expiry support before dispatch or audit admission', async () => {
    const { controller } = await manuallyEnrolledController();
    await db.getRepository(WagoController).update(controller.id, { capabilities: '["claim","configuration-v1"]' });
    mqtt.publish.mockClear();
    await post(`controllers/${controller.id}/credentials/manual/complete`, {
      name: 'Manual fixture',
      verifier,
      username: 'wago-controller-manual-fixture',
      password: privateValue,
    }).expect(409);
    expect(mqtt.publish).not.toHaveBeenCalled();
    expect(await rows('manual_credential_fallback')).toHaveLength(0);
  });
});

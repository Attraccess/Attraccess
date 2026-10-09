import { AuditLog } from '@attraccess/database-entities';
import type { PluginContext, PluginMqttClient } from '@attraccess/plugins-backend-sdk';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import httpRequest from 'supertest';
import { DataSource } from 'typeorm';
import { AuditService } from '../../../../api/src/audit/audit.service';
import { ApiTokenService } from '../../../../api/src/users-and-auth/auth/api-token/api-token.service';
import { SessionService } from '../../../../api/src/users-and-auth/auth/session.service';
import { TwoFactorService } from '../../../../api/src/users-and-auth/auth/two-factor.service';
import { AuthAuditLogger } from '../../../../api/src/users-and-auth/rate-limiting/auth-audit.logger';
import { RbacService } from '../../../../api/src/users-and-auth/rbac/rbac.service';
import { SessionStrategy } from '../../../../api/src/users-and-auth/strategies/session.strategy';
import { heartbeatTopic, discoveryTopic } from '../../backend/protocol';
import { WagoCommissioningSession } from '../../backend/commissioning/sessions/session.entity';
import { WagoCommissioningService } from '../../backend/commissioning/service';
import { WagoController } from '../../backend/controllers/entity';
import { WagoCredentialRotationService, WagoCredentialRotationEntity } from '../../backend/credentials/service';
import { WagoRuntimeArtifactsService } from '../../backend/runtime/artifacts/catalog';
import { WagoControllerApi } from '../../backend/controllers/controller';
import { WagoService } from '../../backend/controllers/service';
import type { WagoConfigurationSnapshot } from '../../backend/configuration/model';

export const pluginId = 'abcdefghijklmnopqrstu';
export const principal = { userId: 42, authenticationMethod: 'api-token' as const, apiTokenId: 19 };
export const verifier = 'v'.repeat(43);
export const privateValue = 'fixture-only-password-never-audit';
export const snapshot: WagoConfigurationSnapshot = {
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
export class FixtureMqtt implements PluginMqttClient {
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

export class AuditFixtureState {
  schemaDirectory!: string;
  directory!: string;
  db!: DataSource;
  audit!: AuditService;
  wago!: WagoService;
  commissioning!: WagoCommissioningService;
  app!: INestApplication;
  mqtt!: FixtureMqtt;
  context!: PluginContext;
  session!: WagoCommissioningSession;
  artifacts!: WagoRuntimeArtifactsService;
  revoke = jest.fn(async () => undefined);
  async mountApi() {
    const module = await Test.createTestingModule({
      controllers: [WagoControllerApi],
      providers: [
        SessionStrategy,
        { provide: WagoService, useValue: this.wago },
        { provide: WagoCommissioningService, useValue: this.commissioning },
        { provide: WagoCredentialRotationService, useFactory: () => new WagoCredentialRotationService(this.context) },
        { provide: Symbol.for('attraccess.plugin.context'), useValue: this.context },
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
    this.app = module.createNestApplication();
    this.app.use(cookieParser());
    this.app.useLogger(false);
    await this.app.init();
    await this.app.listen(0, '127.0.0.1');
  }
  post(path: string, body: object = {}, token = 'fixture-token') {
    return httpRequest(this.app.getHttpServer())
      .post(`/wago/${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }
  remove(id: number) {
    return httpRequest(this.app.getHttpServer())
      .delete(`/wago/controllers/${id}`)
      .set('Authorization', 'Bearer fixture-token');
  }
  async rows(action: string) {
    return this.db.getRepository(AuditLog).find({ where: { action: `wago.${action}` }, order: { id: 'ASC' } });
  }
  async lifecycle(
    action: string,
    subjectId: number,
    outcome: 'succeeded' | 'failed' = 'succeeded',
    details: Record<string, string | number> = {},
  ) {
    const records = await this.rows(action);
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
  async deliverAndClaim() {
    jest.mocked(this.wago.createEnrollment).mockImplementationOnce(async (...args) => {
      const persisted = await this.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: this.session.id });
      expect(JSON.parse(persisted.platformReport).clock).toMatchObject({
        observation: 'before-action',
        action: 'none',
        result: 'within-tolerance',
      });
      return WagoService.prototype.createEnrollment.apply(this.wago, args);
    });
    const { body: delivered } = await this.post(`commissioning/sessions/${this.session.id}/deliver`, {
      confirmInstall: true,
      temporarySsh: { username: 'root', password: privateValue },
    }).expect(201);
    expect(delivered.state).toBe('awaiting_discovery');
    expect(delivered).not.toHaveProperty('initiatingPrincipal');
    expect(
      (await this.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: this.session.id }))
        .initiatingPrincipal,
    ).toBe(JSON.stringify(principal));
    const enrollment = await this.db
      .getRepository('plugin_wago_enrollments')
      .findOneByOrFail({ id: delivered.enrollmentId });
    // Observe the actual enrollment result, without mocking its persistence or parsing generated shell source.
    const credentials = await jest.mocked(this.wago.createEnrollment).mock.results[0].value;
    expect(enrollment.id).toBe(credentials.id);
    await this.mqtt.announce(this.session.hardwareId, credentials.claimSecret);
    const controller = await this.db
      .getRepository(WagoController)
      .findOneByOrFail({ hardwareId: this.session.hardwareId });
    expect(controller.trustState).toBe('claimed');
    return controller;
  }
  async saveAndPublish(id: number, value = snapshot, force = false) {
    await this.post(`controllers/${id}/configuration/draft`, { snapshot: value }).expect(201);
    const { body: review } = await this.post(`controllers/${id}/configuration/review`).expect(201);
    return (
      await this.post(`controllers/${id}/configuration/publish`, { force, reviewedHash: review.contentHash }).expect(
        201,
      )
    ).body;
  }
  async rotationReady(controller: WagoController) {
    const timestamp = new Date().toISOString();
    await this.mqtt.receive(heartbeatTopic('attraccess/wago', controller.hardwareId), {
      hardwareId: controller.hardwareId,
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: ['claim', 'claim-expiry-v1', 'heartbeat', 'configuration-v1', 'credential-rotation-v1'],
      timestamp,
      streamId: '11111111-1111-4111-8111-111111111111',
      sequence: 1,
    });
    const updated = await this.db.getRepository(WagoController).findOneByOrFail({ id: controller.id });
    expect(updated.lastHeartbeatAt).toBe(timestamp);
    expect(JSON.parse(updated.capabilities)).toContain('credential-rotation-v1');
  }
  observeRotationProvider() {
    const provider = this.context.getMqttCredentialProvisioning();
    const rotate = jest.fn(provider.rotate);
    jest.spyOn(this.context, 'getMqttCredentialProvisioning').mockReturnValue({ ...provider, rotate });
    return rotate;
  }
  rotationRecord(controllerId: number) {
    return this.db
      .getRepository(WagoCredentialRotationEntity)
      .createQueryBuilder('rotation')
      .addSelect('rotation.encryptedCredentials')
      .where('rotation.controllerId = :controllerId', { controllerId })
      .getOneOrFail();
  }
  async manuallyEnrolledController() {
    const enrollment = await this.wago.createEnrollment('manual-fixture', 1);
    await this.mqtt.announce('manual-fixture', enrollment.claimSecret);
    const controller = await this.db.getRepository(WagoController).findOneByOrFail({ hardwareId: 'manual-fixture' });
    expect(controller.trustState).toBe('untrusted');
    const provisioner = this.context.getMqttCredentialProvisioning();
    const provision = jest.fn(provisioner.provision);
    jest
      .spyOn(this.context, 'getMqttCredentialProvisioning')
      .mockReturnValue({ ...provisioner, availableProviders: async () => [], provision });
    return { controller, provision };
  }

  constructor() {
    this.mountApi = this.mountApi.bind(this);
    this.post = this.post.bind(this);
    this.remove = this.remove.bind(this);
    this.rows = this.rows.bind(this);
    this.lifecycle = this.lifecycle.bind(this);
    this.deliverAndClaim = this.deliverAndClaim.bind(this);
    this.saveAndPublish = this.saveAndPublish.bind(this);
    this.rotationReady = this.rotationReady.bind(this);
    this.observeRotationProvider = this.observeRotationProvider.bind(this);
    this.rotationRecord = this.rotationRecord.bind(this);
    this.manuallyEnrolledController = this.manuallyEnrolledController.bind(this);
  }
}

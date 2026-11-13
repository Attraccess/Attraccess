import { AuditLog, ResourceHealthStatus, SSOProviderType } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WebSocket } from 'ws';
import { AttractapPairingController } from '../attractap/pairing.controller';
import { PairingService } from '../attractap/security/pairing.service';
import { AttractapAuthHandler } from '../attractap/websockets/handlers/auth/auth.handler';
import { readerTimeZoneStub } from '../attractap/websockets/reader-time-zone.test-fixture';
import { WebsocketService } from '../attractap/websockets/websocket.service';
import { AttractapEvent, AttractapEventType } from '../attractap/websockets/websocket.types';
import { BillingService } from '../billing/charges/billing.service';
import { MqttServerController } from '../mqtt/servers/mqtt-server.controller';
import { MqttServerService } from '../mqtt/servers/mqtt-server.service';
import { ProjectsController } from '../projects/projects.controller';
import { ProjectsService } from '../projects/projects.service';
import { ResourceHealthController } from '../resources/health/resource-health.controller';
import { ResourceHealthService } from '../resources/health/resource-health.service';
import { SessionService } from '../users-and-auth/auth/session.service';
import { SsoProvisioningService } from '../users-and-auth/auth/sso/provisioning/sso-provisioning.service';
import { setupAuditDatabase } from './audit.test-fixture';
import { auditActorOf } from './recorder/audit-event';

/**
 * Audit lives in the services that own a change, so a change made without an HTTP request (a flow, a reader, the
 * SumUp poll, an identity provider, a reader) is recorded like the HTTP path. These run the real services against
 * the real audit storage; only the domain repositories are stand-ins.
 */
describe('audit recorded by the owning services, without the HTTP layer', () => {
  const fixture = setupAuditDatabase();
  const req = { user: { id: 42, authenticationMethod: 'api-token', apiTokenId: 9 } } as AuthenticatedRequest;

  beforeEach(async () => {
    await fixture.store.setPlainSetting(
      'audit',
      'domains',
      JSON.stringify(['administration', 'attractap', 'billing', 'identity', 'project', 'resource', 'sso']),
    );
  });

  /** Every stored column except the generated id, timestamp and operation id. */
  const rows = async () =>
    (await fixture.source.getRepository(AuditLog).find({ order: { id: 'ASC' } })).map(
      ({ id, at, operationId, ...row }) => (void id, void at, void operationId, row),
    );

  const waitForRows = async (count: number) => {
    for (let attempt = 0; attempt < 100 && (await rows()).length < count; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    return rows();
  };

  const row = (fields: Partial<AuditLog>) => ({
    pluginId: 'core',
    actorId: null,
    authenticationMethod: null,
    apiTokenId: null,
    outcome: 'succeeded',
    ipAddress: null,
    userAgent: null,
    ...fields,
  });

  it('administration: creating an MQTT server through the service records the same row as the HTTP route', async () => {
    // Entity defaults, as a saved row carries them.
    const server = {
      id: 7,
      name: 'Workshop',
      host: 'mqtt.example',
      port: 1883,
      useTls: false,
      defaultPublishQos: 0,
      defaultPublishRetain: false,
      defaultSubscribeQos: 0,
    };
    const service = new MqttServerService(
      {
        create: (value: object) => ({ ...server, ...value }),
        save: async (value: object) => ({ ...value, id: 7 }),
      } as never,
      { encrypt: (value: string) => `enc:${value}` } as never,
      { mqttServersTotal: { inc: jest.fn() } } as never,
      { emit: jest.fn() } as never,
      fixture.service,
    );
    const dto = { name: 'Workshop', host: 'mqtt.example', port: 1883 } as never;

    await new MqttServerController(service).createOne(dto, req);
    await service.create(dto, auditActorOf(req.user));

    const [http, direct] = await rows();
    expect(http).toEqual(
      row({
        domain: 'administration',
        action: 'mqtt_server.created',
        actorId: 42,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        subjectType: 'mqtt-server',
        subjectId: 7,
        details: {
          serverName: 'Workshop',
          host: 'mqtt.example',
          passwordChanged: 0,
          port: 1883,
          managementPort: 0,
          usernameConfigured: 0,
          useTls: 0,
          caCertConfigured: 0,
          tlsInsecure: 0,
          tlsServername: '',
          defaultPublishQos: 0,
          defaultPublishRetain: 0,
          defaultSubscribeQos: 0,
        },
      }),
    );
    expect(direct).toEqual(http);
  });

  it('resource: clearing a health entry through the service records the same row as the HTTP route', async () => {
    // Two stuck unhealthy entries of one resource, as a flow left them.
    const entries = [1, 2].map((id) => ({
      id,
      resourceId: 5,
      identifier: `bridge-${id}`,
      status: ResourceHealthStatus.UNHEALTHY,
      source: 'payload',
    }));
    const health = new ResourceHealthService(
      {
        findOne: async ({ where }: { where: { id: number; resourceId: number } }) =>
          entries.find((entry) => entry.id === where.id && entry.resourceId === where.resourceId) ?? null,
        remove: async (entry: object) => entry,
      } as never,
      {} as never,
      { emit: jest.fn() } as never,
      fixture.service,
    );

    await new ResourceHealthController(health).clearResourceHealthEntry(5, 1, req);
    await health.clearEntry(5, 2, auditActorOf(req.user));

    const [http, direct] = await rows();
    expect(http).toEqual(
      row({
        domain: 'resource',
        action: 'health.transition',
        actorId: 42,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        subjectType: 'resource',
        subjectId: 5,
        details: { previousStatus: 'unhealthy', status: 'healthy', healthSource: 'payload' },
      }),
    );
    expect(direct).toEqual(http);
  });

  describe('attractap', () => {
    it('revoking a reader through the pairing service records the same row as the HTTP route', async () => {
      const registry = { revoke: jest.fn(async () => undefined) };
      const pairing = new PairingService(
        {} as never,
        {} as never,
        registry as never,
        fixture.service,
        new EventEmitter2(),
        {} as never,
        {} as never,
        {} as never,
      );

      await new AttractapPairingController(pairing, registry as never, new WebsocketService()).revoke(9, req);
      await pairing.revoke(9, { userId: 42, authenticationMethod: 'api-token', apiTokenId: 9 });

      expect(registry.revoke).toHaveBeenCalledTimes(2);
      const [http, direct] = await rows();
      expect(http).toEqual(
        row({
          domain: 'attractap',
          action: 'attractap.reader.revoked',
          actorId: 42,
          authenticationMethod: 'api-token',
          apiTokenId: 9,
          subjectType: 'attractap.reader',
          subjectId: 9,
          details: { reason: 'admin' },
        }),
      );
      expect(direct).toEqual(http);
    });

    it('a paired reader signing in with a token over the reader websocket records the rejection as the device', async () => {
      const handler = new AttractapAuthHandler();
      Object.assign(handler, {
        logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        attractapService: { findReaderById: async (id: number) => ({ id, name: 'Lathe', pairingState: 'paired' }) },
        metricsService: { attractapReaderConnected: { set: jest.fn() } },
        audit: fixture.service,
        readerTimeZone: readerTimeZoneStub(),
        settingsService: { getDefaultLanguage: async () => 'en' },
        websocketService: new WebsocketService(),
      });
      const socket = {
        id: 'socket-1',
        readerId: null,
        readerName: null,
        readyState: WebSocket.OPEN,
        state: {},
        sendMessage: jest.fn(async () => undefined),
      };

      await handler.handleAuthentication(socket as never, { payload: { id: 9, token: 'stolen-token' } } as never);

      expect(socket.sendMessage).toHaveBeenCalledWith(
        new AttractapEvent(AttractapEventType.READER_UNAUTHORIZED, { message: 'PAIRING_REQUIRED' }),
      );
      expect(await rows()).toEqual([
        row({
          domain: 'attractap',
          action: 'attractap.reader.token_rejected',
          subjectType: 'attractap.reader',
          subjectId: 9,
          details: { reason: 'paired' },
        }),
      ]);
      expect(JSON.stringify(await rows())).not.toContain('stolen-token');
    });
  });

  it('project: creating a project through the service records the same row as the HTTP route', async () => {
    const projects = new ProjectsService(
      { save: async (value: object) => ({ ...value, id: 3 }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { projectsTotal: { inc: jest.fn() } } as never,
      {} as never,
      fixture.service,
    );
    const controller = new ProjectsController(
      projects,
      {} as never,
      {} as never,
      { getAccessOrThrow: async (_userId: number, id: number) => ({ id, name: 'Workshop project' }) } as never,
    );

    await controller.create(req, { name: 'Workshop project' } as never);
    await projects.create(42, { name: 'Workshop project' } as never, 'api-token', 9);

    const [http, direct] = await rows();
    expect(http).toEqual(
      row({
        domain: 'project',
        action: 'project.created',
        actorId: 42,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        subjectType: 'project',
        subjectId: 3,
        details: { projectId: 3, 'after.hasLogo': 0, 'after.name': 'Workshop project' },
      }),
    );
    expect(direct).toEqual(http);
  });

  it('billing: a manual transaction records the deterministic billing operation', async () => {
    const billing = new BillingService(
      { save: async (value: object) => ({ ...value, id: 11 }) } as never,
      { findOneBy: async () => ({ id: 5, creditBalance: 100 }) } as never,
      {} as never,
      { notifyTransactionUpdate: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { billingTransactionsTotal: { inc: jest.fn() }, billingTransactionAmount: { observe: jest.fn() } } as never,
      fixture.service,
    );

    await billing.createManualTransaction(5, 42, 25);

    // The ledger records without awaiting the write (outside any transaction).
    expect(await waitForRows(1)).toEqual([
      row({
        domain: 'billing',
        pluginId: 'billing',
        action: 'billing.transaction.created',
        actorId: 42,
        authenticationMethod: 'session',
        subjectType: 'billing.transaction',
        subjectId: 11,
        details: { amount: 25, status: 'completed', source: 'manual' },
      }),
    ]);
    expect((await fixture.source.getRepository(AuditLog).findOneByOrFail({})).operationId).toBe(
      'billing-transaction-11',
    );
  });

  it('identity: ending a login records the logout for the origin captured before the session ended', async () => {
    const sessions = new SessionService({} as never, {} as never, {} as never, {} as never, fixture.service);
    const origin = {
      actor: { id: 42, authenticationMethod: 'session' as const },
      request: { ipAddress: '203.0.113.7', userAgent: 'Audit test' },
    };

    await sessions.endLogin(origin, async () => undefined);

    expect(await rows()).toEqual([
      row({
        domain: 'identity',
        pluginId: null,
        action: 'identity.logout',
        actorId: 42,
        authenticationMethod: 'session',
        subjectType: 'identity.user',
        subjectId: 42,
        ipAddress: '203.0.113.7',
        userAgent: 'Audit test',
        details: {},
      }),
    ]);
  });

  it('sso: an identity-provider logout records the provisioning change without a user actor', async () => {
    const provisioning = new SsoProvisioningService(
      {} as never,
      { revokeAllUserSessions: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      fixture.service,
    );
    const provider = {
      id: 3,
      name: 'Workshop IdP',
      type: SSOProviderType.OIDC,
      oidcConfiguration: {
        issuer: 'https://idp.example.test',
        authorizationURL: 'https://idp.example.test/authorize',
        tokenURL: 'https://idp.example.test/token',
        userInfoURL: 'https://idp.example.test/userinfo',
        clientId: 'workshop',
        clientSecret: 'never-record-this-secret',
        scopes: ['email'],
        roleMappings: null,
      },
    } as never;

    await provisioning.revokeSessions(provider, 77);

    const [stored] = await rows();
    expect(stored).toEqual(
      row({
        domain: 'sso',
        pluginId: null,
        action: 'sso.provisioning.sessions_revoked',
        subjectType: 'user',
        subjectId: 77,
        details: { provider: expect.any(String), changes: JSON.stringify({ sessionsRevoked: true }) },
      }),
    );
    expect(JSON.stringify(stored)).not.toContain('never-record-this-secret');
  });

  it('plugin domains: the SDK host provider stores the registering plugin as pluginId', async () => {
    await fixture.store.setPlainSetting('audit', 'plugin_domains_disabled', '[]');

    expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'recorded' });

    expect(await rows()).toEqual([
      row({
        domain: 'demo',
        pluginId: fixture.fixturePluginId,
        action: 'demo.publication',
        actorId: 42,
        authenticationMethod: 'session',
        subjectType: 'demo.device',
        subjectId: 7,
        details: { revision: 2 },
      }),
    ]);
  });
});

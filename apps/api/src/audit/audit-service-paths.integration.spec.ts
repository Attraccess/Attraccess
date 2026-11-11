import { AuditLog, ResourceHealthSource, ResourceHealthStatus, SSOProviderType } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { recordPairingEvent } from '../attractap/security/pairing-audit';
import { BillingService } from '../billing/charges/billing.service';
import { MqttServerController } from '../mqtt/servers/mqtt-server.controller';
import { MqttServerService } from '../mqtt/servers/mqtt-server.service';
import { ProjectsService } from '../projects/projects.service';
import { ResourceHealthService } from '../resources/health/resource-health.service';
import { SessionService } from '../users-and-auth/auth/session.service';
import { SsoProvisioningService } from '../users-and-auth/auth/sso/provisioning/sso-provisioning.service';
import { setupAuditDatabase } from './audit.test-fixture';
import { auditActorOf } from './recorder/audit-event';

/**
 * Audit lives in the services that own a change, so a change made without an HTTP request (a flow, a reader, the
 * SumUp poll, an identity provider, a plugin) is recorded like the HTTP path. These run the real services against
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

  it('administration: a plugin calling the MQTT server service records the same row as the HTTP route', async () => {
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
        details: expect.objectContaining({ serverName: 'Workshop', host: 'mqtt.example', passwordChanged: 0 }),
      }),
    );
    expect(direct).toEqual(http);
  });

  it('resource: a flow reporting health records the transition without a user', async () => {
    const health = new ResourceHealthService(
      { findOne: async () => null, create: (value: object) => value, save: async (value: object) => value } as never,
      {} as never,
      { emit: jest.fn() } as never,
      fixture.service,
    );

    await health.reportHealth({
      resourceId: 5,
      status: ResourceHealthStatus.UNHEALTHY,
      source: ResourceHealthSource.HEARTBEAT,
    });

    expect(await rows()).toEqual([
      row({
        domain: 'resource',
        action: 'health.transition',
        subjectType: 'resource',
        subjectId: 5,
        details: { previousStatus: 'none', status: 'unhealthy', healthSource: 'heartbeat' },
      }),
    ]);
  });

  it('attractap: a reader-initiated pairing event records the device actor', async () => {
    await recordPairingEvent(fixture.service, 9, 'reader.pairing_failed', null, { reason: 'not-delivered' });

    expect(await rows()).toEqual([
      row({
        domain: 'attractap',
        action: 'attractap.reader.pairing_failed',
        subjectType: 'attractap.reader',
        subjectId: 9,
        details: { reason: 'not-delivered' },
      }),
    ]);
  });

  it('project: creating a project through the service records the owner as actor', async () => {
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

    await projects.create(42, { name: 'Workshop project' } as never);

    expect(await rows()).toEqual([
      row({
        domain: 'project',
        action: 'project.created',
        actorId: 42,
        authenticationMethod: 'session',
        subjectType: 'project',
        subjectId: 3,
        details: expect.objectContaining({ 'after.name': 'Workshop project' }),
      }),
    ]);
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

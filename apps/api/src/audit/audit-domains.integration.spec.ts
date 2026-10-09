import { AuditLog, entities, Setting } from '@attraccess/database-entities';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as migrations from '../database/migrations';
import {
  getPluginAuditDomain,
  registerPluginAuditDomains,
  resetPluginAuditRegistry,
} from '../plugin-system/audit/audit-registry';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsController } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { SessionService } from '../users-and-auth/auth/session.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import {
  domains,
  fixturePluginId,
  pluginDomain,
  scenarioEntries,
  scenarios,
} from './audit-domain-scenarios.test-fixture';
import { CORE_AUDIT_DOMAINS } from './policies/domains';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('audit domains through migrated storage and the admin HTTP API', () => {
  let directory: string;
  let source: DataSource;
  let audit: AuditService;
  let store: SettingsStoreService;
  let app: INestApplication;
  const ownerPermissions = new Set(['system.audit.read', 'system.settings.manage', 'users.api-tokens.manage']);
  const coreDomains = [...CORE_AUDIT_DOMAINS];
  const read = (query: Record<string, string | number> = {}, token = 'audit-reader') =>
    request(app.getHttpServer()).get('/api/admin/audit-log').set('Authorization', `Bearer ${token}`).query(query);
  const configure = (body: object) =>
    request(app.getHttpServer()).patch('/api/settings/audit').set('Authorization', 'Bearer audit-manager').send(body);
  const disable = (domain: string) =>
    getPluginAuditDomain(domain)
      ? { plugin_domains_disabled: [domain] }
      : { domains: coreDomains.filter((value) => value !== domain) };
  const emitAll = async () => {
    for (const scenario of scenarios) await scenario.emit(audit);
  };
  beforeAll(async () => {
    resetPluginAuditRegistry();
    registerPluginAuditDomains({ name: 'domains-fixture-plugin', id: fixturePluginId }, [
      {
        domain: pluginDomain,
        actions: [
          {
            action: 'demo.publication',
            subjectTypes: ['demo.device'],
            details: { revision: { type: 'number', integer: true, min: 1 } },
          },
        ],
      },
    ]);
    directory = await mkdtemp(join(tmpdir(), 'audit-domains-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'audit.sqlite'),
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    store = new SettingsStoreService(source.getRepository(Setting), null);
    audit = new AuditService(source, store);
    const module = await Test.createTestingModule({
      controllers: [AuditController, SettingsController],
      providers: [
        SessionStrategy,
        { provide: AuditService, useValue: audit },
        {
          provide: SettingsService,
          useValue: new SettingsService(null, store, { getSettings: async () => ({}) } as never),
        },
        { provide: SessionService, useValue: { authenticateSession: async () => null } },
        { provide: TwoFactorService, useValue: { getStatus: async () => ({ required: false }) } },
        { provide: RbacService, useValue: { getEffectivePermissions: async () => ownerPermissions } },
        {
          provide: ApiTokenService,
          useValue: {
            authenticate: async (token: string) =>
              !['audit-reader', 'audit-manager'].includes(token)
                ? null
                : {
                    user: { id: 42 },
                    apiToken: {
                      id: 19,
                      permissionKeys: [token === 'audit-reader' ? 'system.audit.read' : 'system.settings.manage'],
                    },
                  },
          },
        },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  }, 60_000);
  beforeEach(async () => {
    ownerPermissions.add('system.audit.read');
    await configure({
      enabled: true,
      domains: coreDomains,
      plugin_domains_disabled: [],
      retention_days: 90,
    }).expect(200);
    await source.getRepository(AuditLog).clear();
  });
  afterAll(async () => {
    resetPluginAuditRegistry();
    if (app) await app.close();
    if (source?.isInitialized) await source.destroy();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const fixture = {
    get fixturePluginId() {
      return fixturePluginId;
    },
    get scenarios() {
      return scenarios;
    },
    get domains() {
      return domains;
    },
    get scenarioEntries() {
      return scenarioEntries;
    },
    get directory() {
      return directory;
    },
    get source() {
      return source;
    },
    get audit() {
      return audit;
    },
    get store() {
      return store;
    },
    get app() {
      return app;
    },
    get ownerPermissions() {
      return ownerPermissions;
    },
    get read() {
      return read;
    },
    get configure() {
      return configure;
    },
    get disable() {
      return disable;
    },
    get emitAll() {
      return emitAll;
    },
    set store(value: typeof store) {
      store = value;
    },
  };

  it.each([
    [null, 'de'],
    ['', 'en'],
    ['fr', 'en'],
    ['de-DE', 'de'],
    ['de-u-12', 'en'],
  ])('resolves persisted language %s through the real store and its cache', async (value, expected) => {
    const repository = source.getRepository(Setting);
    await repository.delete({ parent: 'app', key: 'attractap_language' });
    if (value !== null) await repository.save(repository.create({ parent: 'app', key: 'attractap_language', value }));
    const persistedStore = new SettingsStoreService(repository, null);
    const settings = new SettingsService(null, persistedStore, null);
    expect((await settings.getAppSettings()).attractapLanguage).toBe(expected);
    expect(await settings.getAttractapLanguage()).toBe(expected);
  });

  it('persists settings.updated with canonical language deltas for successful HTTP changes', async () => {
    await store.setPlainSetting('app', 'attractap_language', 'de');
    for (const attractapLanguage of ['en', 'de']) {
      await request(app.getHttpServer())
        .patch('/api/settings')
        .set('Authorization', 'Bearer audit-manager')
        .send({ app: { attractapLanguage } })
        .expect(200)
        .expect(({ body }) => expect(body.app.attractapLanguage).toBe(attractapLanguage));
    }
    const rows = await source.getRepository(AuditLog).find({ order: { id: 'ASC' } });
    expect(rows.map(({ action, details }) => ({ action, details }))).toEqual([
      { action: 'settings.updated', details: { settingKey: 'app.attractapLanguage', before: 'de', after: 'en' } },
      { action: 'settings.updated', details: { settingKey: 'app.attractapLanguage', before: 'en', after: 'de' } },
    ]);
    await read({ action: 'settings.updated' })
      .expect(200)
      .expect(({ body }) => expect(body.items).toHaveLength(2));
  });

  it('records no successful language audit change when HTTP persistence fails', async () => {
    await store.setPlainSetting('app', 'attractap_language', 'de');
    const failure = jest.spyOn(store, 'setPlainSetting').mockRejectedValueOnce(new Error('Injected write failure'));
    try {
      await request(app.getHttpServer())
        .patch('/api/settings')
        .set('Authorization', 'Bearer audit-manager')
        .send({ app: { attractapLanguage: 'en' } })
        .expect(500);
      expect(await store.getPlainSetting('app', 'attractap_language')).toBe('de');
      expect(
        await source.getRepository(Setting).findOneByOrFail({ parent: 'app', key: 'attractap_language' }),
      ).toMatchObject({ value: 'de' });
      expect(await source.getRepository(AuditLog).count()).toBe(0);
    } finally {
      failure.mockRestore();
    }
  });

  it.each(fixture.scenarios)(
    'exposes $domain events through every admin filter without mixing targets',
    async (scenario) => {
      const from = new Date(Date.now() - 1000).toISOString();
      await fixture.emitAll();
      const to = new Date(Date.now() + 1000).toISOString();
      for (const filter of [
        { domain: scenario.domain },
        { eventPrefix: scenario.action },
        { action: scenario.action },
        { subjectType: scenario.subjectType, subjectId: scenario.subjectId },
      ]) {
        await fixture
          .read({ ...filter, actorId: 42, outcome: 'succeeded', from, to })
          .expect(200)
          .expect(({ body }) => {
            expect(body.items).toHaveLength(1);
            expect(body.items[0]).toMatchObject({
              domain: scenario.domain,
              action: scenario.action,
              subjectType: scenario.subjectType,
              subjectId: scenario.subjectId,
              actorId: 42,
            });
          });
      }
    },
  );

  it.each(fixture.scenarios)(
    'suppresses only the disabled $domain while retaining its existing history',
    async (scenario) => {
      await fixture.emitAll();
      await fixture.configure(fixture.disable(scenario.domain)).expect(200);
      await fixture.emitAll();
      const { body } = await fixture.read().expect(200);
      for (const domain of fixture.domains)
        expect(fixture.scenarioEntries(body.items).filter((item) => item.domain === domain)).toHaveLength(
          domain === scenario.domain ? 1 : 2,
        );
    },
  );

  it('pauses all capture without hiding prior events and resumes through persisted settings', async () => {
    await fixture.emitAll();
    await fixture.configure({ enabled: false }).expect(200);
    await fixture.emitAll();
    await fixture
      .read()
      .expect(200)
      .expect(({ body }) => {
        expect(fixture.scenarioEntries(body.items)).toHaveLength(fixture.scenarios.length);
        expect(body.items).toContainEqual(
          expect.objectContaining({
            action: 'settings.updated',
            details: expect.objectContaining({ settingKey: 'audit.enabled', before: 'true', after: 'false' }),
          }),
        );
      });
    await fixture.configure({ enabled: true }).expect(200);
    await fixture.emitAll();
    await fixture
      .read()
      .expect(200)
      .expect(({ body }) => expect(fixture.scenarioEntries(body.items)).toHaveLength(fixture.scenarios.length * 2));
  });

  it('enforces audit permissions independently of settings administration and token-owner permissions', async () => {
    await fixture.emitAll();
    await request(fixture.app.getHttpServer()).get('/api/admin/audit-log').expect(401);
    await fixture.read({}, 'unknown').expect(401);
    await fixture.read({}, 'audit-manager').expect(403);
    await fixture.configure({ enabled: false }).set('Authorization', 'Bearer audit-reader').expect(403);
    await fixture.read().expect(200);
    fixture.ownerPermissions.delete('system.audit.read');
    await fixture.read().expect(403);
  });

  it('paginates across domains and applies shortened retention before cleanup', async () => {
    await fixture.emitAll();
    const seen: number[] = [];
    let beforeId: number | undefined;
    do {
      const { body } = await fixture.read({ limit: 1, ...(beforeId ? { beforeId } : {}) }).expect(200);
      seen.push(...body.items.map((item: AuditLog) => item.id));
      beforeId = body.nextCursor ?? undefined;
    } while (beforeId);
    expect(new Set(seen).size).toBe(fixture.scenarios.length);
    expect(seen).toHaveLength(fixture.scenarios.length);
    const row = await fixture.source.getRepository(AuditLog).findOneByOrFail({ id: seen[0] });
    const expired = await fixture.source.getRepository(AuditLog).save({
      ...row,
      id: undefined,
      at: new Date(Date.now() - 3 * 86400000),
    });
    await fixture
      .read()
      .expect(200)
      .expect(({ body }) => expect(body.items).toHaveLength(fixture.scenarios.length + 1));
    await fixture.configure({ retention_days: 1 }).expect(200);
    await fixture
      .read()
      .expect(200)
      .expect(({ body }) => expect(fixture.scenarioEntries(body.items)).toHaveLength(fixture.scenarios.length));
    await fixture.audit.cleanup();
    expect(await fixture.source.getRepository(AuditLog).findOneBy({ id: expired.id })).toBeNull();
    expect(fixture.scenarioEntries(await fixture.source.getRepository(AuditLog).find())).toHaveLength(
      fixture.scenarios.length,
    );
  });

  it('keeps representative credential-bearing inputs out of stored and exported details', async () => {
    const secret = 'audit-security-sentinel-secret';
    await fixture.emitAll();
    await fixture.audit.record({
      pluginId: fixture.fixturePluginId,
      action: 'demo.publication',
      operationId: randomUUID(),
      principal: { userId: 42, authenticationMethod: 'session' },
      outcome: 'succeeded',
      subject: { type: 'demo.device', id: 102 },
      details: { password: secret },
    } as never);
    await fixture.audit.recordResource({
      action: 'maintenance_schedule.updated',
      actorId: 42,
      subjectId: 101,
      details: { scheduleId: 12, password: secret },
    } as never);
    await fixture.audit.recordIdentity({
      action: 'user_updated',
      operationId: randomUUID(),
      actorId: 42,
      outcome: 'succeeded',
      subjectType: 'identity.user',
      subjectId: 105,
      details: { password: secret },
    });
    await fixture.audit.recordProject({
      action: 'project.created',
      actorId: 42,
      subjectType: 'project',
      subjectId: 106,
      details: { projectId: 106, invitationToken: secret },
    } as never);
    await fixture.audit.recordAdministration({
      action: 'mqtt_server.created',
      actorId: 42,
      subjectType: 'mqtt-server',
      subjectId: 104,
      details: { password: secret },
    } as never);
    await fixture.audit.recordAttractap({
      action: 'card.linked',
      actorId: 42,
      authenticationMethod: 'session',
      subjectId: 107,
      details: { source: 'reader-enrollment', cardKey: secret },
    } as never);
    await fixture.audit.recordSso({
      action: 'sso.provider.created',
      operationId: randomUUID(),
      actorId: 42,
      authenticationMethod: 'session',
      subject: { type: 'sso.provider', id: 108 },
      details: {
        before: 'null',
        after: JSON.stringify({
          id: 108,
          name: 'Unsafe provider',
          type: 'oidc',
          configuration: { clientSecret: secret },
        }),
      },
    });
    // Billing projects its own scalar fields and never copies provider payloads.
    await fixture.audit.recordBillingTransaction({
      transactionId: 109,
      userId: 42,
      initiatorId: 42,
      amount: 125,
      status: 'completed',
      source: 'manual',
      providerPayload: { token: secret },
    } as never);
    const { body } = await fixture.read().expect(200);
    expect(body.items).toHaveLength(fixture.scenarios.length + 1);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain('never-record-this-secret');
    expect(JSON.stringify(await fixture.source.getRepository(AuditLog).find())).not.toContain(secret);
  });

  it('records password-policy snapshots for valid generated role keys ending in a separator', async () => {
    const role = `${'a'.repeat(79)}-`;
    await expect(
      fixture.audit.recordIdentity({
        action: 'password_policy_override_updated',
        operationId: randomUUID(),
        actorId: 42,
        authenticationMethod: 'session',
        outcome: 'succeeded',
        subjectType: 'identity.password_policy',
        subjectId: 110,
        details: {
          role,
          before: JSON.stringify({ role, minLength: 8 }),
          after: JSON.stringify({ role, minLength: 12 }),
        },
      }),
    ).resolves.toEqual({ status: 'recorded' });
    await fixture
      .read({ domain: 'identity', action: 'identity.password_policy_override_updated' })
      .expect(200)
      .expect(({ body }) => expect(body.items).toHaveLength(1));
  });
});

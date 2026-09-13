import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuditLog, Setting, entities } from '@attraccess/database-entities';
import * as migrations from '../database/migrations';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { SettingsController } from '../settings/settings.controller';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { SessionService } from '../users-and-auth/auth/session.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';

interface DomainScenario {
  domain: string;
  action: string;
  subjectType: string;
  subjectId: number;
  emit: (audit: AuditService) => Promise<unknown>;
}

// These examples exercise the public event projections, migrated storage, HTTP query
// validation, authentication and settings together. Domain service tests additionally
// verify that the corresponding business operations emit the events.
const scenarios: DomainScenario[] = [
  {
    domain: 'resource',
    action: 'maintenance_schedule.updated',
    subjectType: 'resource',
    subjectId: 101,
    emit: (audit) =>
      audit.recordResource({
        action: 'maintenance_schedule.updated',
        actorId: 42,
        subjectId: 101,
        authenticationMethod: 'api-token',
        apiTokenId: 19,
        details: { scheduleId: 12, enabled: 1, triggerType: 'USAGE_COUNT', usageThreshold: 40 },
      }),
  },
  {
    domain: 'wago',
    action: 'wago.publication',
    subjectType: 'wago.controller',
    subjectId: 102,
    emit: (audit) =>
      audit.record({
        pluginId: 'abcdefghijklmnopqrstu',
        action: 'wago.publication',
        operationId: randomUUID(),
        principal: { userId: 42, authenticationMethod: 'session' },
        outcome: 'succeeded',
        subject: { type: 'wago.controller', id: 102 },
        details: { revision: 2 },
      }),
  },
  {
    domain: 'billing',
    action: 'billing.transaction.created',
    subjectType: 'billing.transaction',
    subjectId: 103,
    emit: (audit) =>
      audit.recordBillingTransaction({
        transactionId: 103,
        userId: 42,
        initiatorId: 42,
        amount: 125,
        status: 'completed',
        source: 'manual',
      }),
  },
  {
    domain: 'administration',
    action: 'mqtt_server.created',
    subjectType: 'mqtt-server',
    subjectId: 104,
    emit: (audit) =>
      audit.recordAdministration({
        action: 'mqtt_server.created',
        actorId: 42,
        authenticationMethod: 'session',
        subjectType: 'mqtt-server',
        subjectId: 104,
        details: { serverName: 'Workshop broker', host: 'mqtt.example.test', port: 1883, useTls: 0 },
      }),
  },
];
const domains = scenarios.map(({ domain }) => domain);
const scenarioActions = new Set(scenarios.map(({ action }) => action));
const scenarioEntries = (items: AuditLog[]) => items.filter(({ action }) => scenarioActions.has(action));

describe('audit domains through migrated storage and the admin HTTP API', () => {
  let directory: string;
  let source: DataSource;
  let audit: AuditService;
  let store: SettingsStoreService;
  let app: INestApplication;
  const ownerPermissions = new Set(['system.audit.read', 'system.settings.manage', 'users.api-tokens.manage']);

  const read = (query: Record<string, string | number> = {}, token = 'audit-reader') =>
    request(app.getHttpServer()).get('/api/admin/audit-log').set('Authorization', `Bearer ${token}`).query(query);
  const configure = (body: object) =>
    request(app.getHttpServer()).patch('/api/settings/audit').set('Authorization', 'Bearer audit-manager').send(body);
  const emitAll = async () => {
    for (const scenario of scenarios) await scenario.emit(audit);
  };

  beforeAll(async () => {
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
        { provide: SettingsService, useValue: new SettingsService(null, store, null) },
        { provide: SessionService, useValue: { validateSession: async () => null } },
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
    await configure({ enabled: true, domains, retention_days: 90 }).expect(200);
    await source.getRepository(AuditLog).clear();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (source?.isInitialized) await source.destroy();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it.each(scenarios)('exposes $domain events through every admin filter without mixing targets', async (scenario) => {
    const from = new Date(Date.now() - 1000).toISOString();
    await emitAll();
    const to = new Date(Date.now() + 1000).toISOString();
    for (const filter of [
      { domain: scenario.domain },
      { eventPrefix: scenario.action },
      { action: scenario.action },
      { subjectType: scenario.subjectType, subjectId: scenario.subjectId },
    ]) {
      await read({ ...filter, actorId: 42, outcome: 'succeeded', from, to })
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
  });

  it.each(scenarios)('suppresses only the disabled $domain while retaining its existing history', async (scenario) => {
    await emitAll();
    await configure({ domains: domains.filter((domain) => domain !== scenario.domain) }).expect(200);
    await emitAll();
    const { body } = await read().expect(200);
    for (const domain of domains)
      expect(scenarioEntries(body.items).filter((item) => item.domain === domain)).toHaveLength(
        domain === scenario.domain ? 1 : 2,
      );
  });

  it('pauses all capture without hiding prior events and resumes through persisted settings', async () => {
    await emitAll();
    await configure({ enabled: false }).expect(200);
    await emitAll();
    await read()
      .expect(200)
      .expect(({ body }) => {
        expect(scenarioEntries(body.items)).toHaveLength(scenarios.length);
        expect(body.items).toContainEqual(
          expect.objectContaining({
            action: 'settings.updated',
            details: expect.objectContaining({ settingKey: 'audit.enabled', before: 'true', after: 'false' }),
          }),
        );
      });
    await configure({ enabled: true }).expect(200);
    await emitAll();
    await read()
      .expect(200)
      .expect(({ body }) => expect(scenarioEntries(body.items)).toHaveLength(scenarios.length * 2));
  });

  it('enforces audit permissions independently of settings administration and token-owner permissions', async () => {
    await emitAll();
    await request(app.getHttpServer()).get('/api/admin/audit-log').expect(401);
    await read({}, 'unknown').expect(401);
    await read({}, 'audit-manager').expect(403);
    await configure({ enabled: false }).set('Authorization', 'Bearer audit-reader').expect(403);
    await read().expect(200);
    ownerPermissions.delete('system.audit.read');
    await read().expect(403);
  });

  it('paginates across domains and applies shortened retention before cleanup', async () => {
    await emitAll();
    const seen: number[] = [];
    let beforeId: number | undefined;
    do {
      const { body } = await read({ limit: 1, ...(beforeId ? { beforeId } : {}) }).expect(200);
      seen.push(...body.items.map((item: AuditLog) => item.id));
      beforeId = body.nextCursor ?? undefined;
    } while (beforeId);
    expect(new Set(seen).size).toBe(scenarios.length);
    expect(seen).toHaveLength(scenarios.length);
    const row = await source.getRepository(AuditLog).findOneByOrFail({ id: seen[0] });
    const expired = await source.getRepository(AuditLog).save({
      ...row,
      id: undefined,
      at: new Date(Date.now() - 3 * 86400000),
    });
    await read()
      .expect(200)
      .expect(({ body }) => expect(body.items).toHaveLength(scenarios.length + 1));
    await configure({ retention_days: 1 }).expect(200);
    await read()
      .expect(200)
      .expect(({ body }) => expect(scenarioEntries(body.items)).toHaveLength(scenarios.length));
    await audit.cleanup();
    expect(await source.getRepository(AuditLog).findOneBy({ id: expired.id })).toBeNull();
    expect(scenarioEntries(await source.getRepository(AuditLog).find())).toHaveLength(scenarios.length);
  });
});

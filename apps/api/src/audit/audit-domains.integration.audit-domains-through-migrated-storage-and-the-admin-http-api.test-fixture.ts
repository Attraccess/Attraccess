import { AuditLog, entities, Setting } from '@attraccess/database-entities';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
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
} from '../plugin-system/plugin-audit-registry';
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
import { CORE_AUDIT_DOMAINS } from './audit-domains';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

// The plugin-contributed domain stands in for any installed plugin: the host
// enables it through the registry plus the plugin blocklist, never a core enum.
// These examples exercise the public event projections, migrated storage, HTTP query
// validation, authentication and settings together. Domain service tests additionally
// verify that the corresponding business operations emit the events.

export function registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture() {
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

  // Core domains record through the allowlist; a plugin domain records while registered
  // and absent from the blocklist, so disabling each kind uses its own setting.
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
  return {
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
}

import { PluginModule } from '../plugin-system/plugin.module';
import { PluginService } from '../plugin-system/plugin.service';
import { PluginSandboxService } from '../plugin-system/plugin-sandbox.service';
import { PluginEventsService } from '../plugin-system/plugin-events.service';
import { PluginMqttService } from '../plugin-system/plugin-mqtt.service';
import { NpmPluginService } from '../plugin-system/npm-plugin.service';
import { PluginClassificationService } from '../plugin-system/plugin-classification.service';
import { MqttModule } from '../mqtt/mqtt.module';
import * as pluginLoader from '../plugin-system/plugin-loader';
import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { SessionService } from '../users-and-auth/auth/session.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';
import { SettingsController } from '../settings/settings.controller';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { AuditLog, Setting, entities } from '@attraccess/database-entities';
import * as migrations from '../database/migrations';
import {
  EffectivePermissionsGuard,
  PLUGIN_AUDIT_HOST_PROVIDER,
  PluginAuditEvent,
} from '@attraccess/plugins-backend-sdk';
import { DurableAudit1783700000000 } from '../database/migrations/1783700000000-durable-audit';
import { AuditService } from './audit.service';
import { AuditModule } from './audit.module';
import { AuditController } from './audit.controller';
import { AuditQueryDto } from './audit-query.dto';
import { readAuditSettings } from './audit.config';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { SettingsModule } from '../settings/settings.module';
import { Module } from '@nestjs/common';
import { AUDIT_ACTIONS, projectAuditEvent } from './audit-policy';
import { createPluginAuditContext } from '../plugin-system/plugin-audit-context';

const event = (): PluginAuditEvent & { pluginId: string } => ({
  pluginId: 'abcdefghijklmnopqrstu',
  action: 'wago.publication',
  operationId: randomUUID(),
  principal: { userId: 42, authenticationMethod: 'session' },
  outcome: 'succeeded',
  subject: { type: 'wago.controller', id: 7 },
  details: { revision: 2 },
});
const config = { enabled: true, domains: ['wago'], retention_days: 90 };

describe('durable audit SQLite', () => {
  let directory: string;
  let source: DataSource;
  let service: AuditService;
  let store: SettingsStoreService;
  const migration = new DurableAudit1783700000000();
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'audit-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'fixture.sqlite'),
      entities: [AuditLog, Setting],
    }).initialize();
    // Existing RBAC schema, with data that an additive upgrade must preserve.
    await source.query('CREATE TABLE permission (key text PRIMARY KEY, label text, description text, category text)');
    await source.query('CREATE TABLE role (id integer PRIMARY KEY, key text)');
    await source.query('CREATE TABLE role_permission (roleId integer, permissionKey text)');
    await source.query('CREATE TABLE api_token_permission (apiTokenId integer, permissionKey text)');
    await source.query("INSERT INTO role VALUES (1, 'administrator'), (2, 'member')");
    await migration.up(source.createQueryRunner());
    await source.query(
      'CREATE TABLE IF NOT EXISTS setting (id integer PRIMARY KEY AUTOINCREMENT, parent varchar NOT NULL, key varchar NOT NULL, value varchar NOT NULL, createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    store = new SettingsStoreService(source.getRepository(Setting), null);
    service = new AuditService(source, store);
    await service.onModuleInit();
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('upgrades additively, survives connection restart and principal deletion, prevents updates, and reverts', async () => {
    expect(await source.query('SELECT * FROM role_permission')).toEqual([
      { roleId: 1, permissionKey: 'system.audit.read' },
    ]);
    expect(await service.record(event())).toEqual({ status: 'recorded' });
    await expect(source.query("UPDATE audit_log SET outcome = 'failed'")).rejects.toThrow('immutable');
    expect(await source.query('PRAGMA foreign_key_list(audit_log)')).toEqual([]);
    await source.query('DELETE FROM role WHERE id = 1');
    await service.onModuleDestroy();
    await source.destroy();
    await source.initialize();
    await source.query(
      'CREATE TABLE IF NOT EXISTS setting (id integer PRIMARY KEY AUTOINCREMENT, parent varchar NOT NULL, key varchar NOT NULL, value varchar NOT NULL, createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    store = new SettingsStoreService(source.getRepository(Setting), null);
    service = new AuditService(source, store);
    await service.onModuleInit();
    expect((await service.list(new AuditQueryDto())).items).toEqual([
      expect.objectContaining({ actorId: 42, details: { revision: 2 } }),
    ]);
    await service.onModuleDestroy();
    await migration.down(source.createQueryRunner());
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toEqual([]);
    expect(await source.query('SELECT * FROM permission')).toEqual([]);
    expect(await source.query('SELECT * FROM role')).toEqual([{ id: 2, key: 'member' }]);
    await migration.up(source.createQueryRunner());
  });

  it('never acknowledges or persists an event in an originating transaction that rolls back', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    const receipt = service.record(event());
    await runner.rollbackTransaction();
    expect(await receipt).toEqual({ status: 'unavailable' });
    expect((await service.list(new AuditQueryDto())).items).toHaveLength(0);
    expect(await service.record(event())).toEqual({ status: 'recorded' });
  });

  it('persists every registered action lifecycle and preserves manual command and profile references', async () => {
    for (const action of AUDIT_ACTIONS) {
      for (const terminal of ['succeeded', 'failed'] as const) {
        const operationId = randomUUID();
        for (const outcome of ['attempted', terminal] as const) {
          expect(
            await service.record({
              ...event(),
              action,
              operationId,
              outcome,
              details: {},
              subject: {
                id: 7,
                type: action.startsWith('wago.commissioning.') ? 'wago.commissioning' : 'wago.controller',
              },
            }),
          ).toEqual({ status: 'recorded' });
        }
        expect((await service.list({ limit: 10, operationId })).items.map((row) => row.outcome)).toEqual([
          terminal,
          'attempted',
        ]);
      }
    }
    const commandId = randomUUID();
    const details = { channelId: 'door-1', commandId, operation: 'pulse', result: 'acknowledged' };
    expect(
      await service.record({
        ...event(),
        action: 'wago.manual_command',
        principal: { userId: 42, authenticationMethod: 'api-token', apiTokenId: 9 },
        details,
      }),
    ).toEqual({ status: 'recorded' });
    expect((await service.list({ limit: 1 })).items[0]).toMatchObject({ apiTokenId: 9, details });
    expect(
      await service.record({
        ...event(),
        action: 'wago.profile_change',
        details: {
          profileId: 'custom-profile',
          profileVersion: 2,
          'before.logicalChannelCount': 1,
          'after.logicalChannelCount': 2,
        },
      }),
    ).toEqual({ status: 'recorded' });
    expect((await service.list({ limit: 1 })).items[0].details).toEqual({
      profileId: 'custom-profile',
      profileVersion: 2,
      'before.logicalChannelCount': 1,
      'after.logicalChannelCount': 2,
    });
  });

  it('filters and paginates without duplication; hides expired rows and cleans them', async () => {
    await service.record(event());
    await service.record({ ...event(), outcome: 'failed' });
    await service.record(event());
    const page = await service.list({ limit: 1 });
    expect(page.nextCursor).toBe(3);
    expect((await service.list({ limit: 10, beforeId: page.nextCursor })).items.map((row) => row.id)).toEqual([2, 1]);
    expect(
      (await service.list({ limit: 10, outcome: 'failed', actorId: 42, subjectId: 7, action: 'wago.publication' }))
        .items,
    ).toHaveLength(1);
    expect((await service.list({ limit: 10, subjectType: 'wago.commissioning' })).items).toHaveLength(0);
    const old = source
      .getRepository(AuditLog)
      .create({ ...(await service.list({ limit: 1 })).items[0], id: undefined, at: new Date(0) });
    await source.getRepository(AuditLog).insert(old);
    expect(await source.getRepository(AuditLog).count()).toBe(4);
    expect((await service.list({ limit: 10 })).items).toHaveLength(3);
    await service.cleanup();
    expect(await source.getRepository(AuditLog).count()).toBe(3);
  });

  it('fails closed on disabled capture, unsupported domains, invalid input and write failure', async () => {
    for (const disabled of [
      { ...config, enabled: false },
      { ...config, domains: [] },
    ]) {
      for (const [key, value] of Object.entries(disabled))
        await store.setPlainSetting('audit', key, JSON.stringify(value));
      const sink = new AuditService(source, store);
      await sink.onModuleInit();
      expect(await sink.record(event())).toEqual({ status: 'unavailable' });
      await sink.onModuleDestroy();
    }
    await store.setPlainSetting('audit', 'enabled', 'true');
    await store.setPlainSetting('audit', 'domains', '["wago"]');
    expect(await service.record({ ...event(), details: { password: 'not-stored' } })).toEqual({
      status: 'unavailable',
    });
    await source.query('DROP TABLE audit_log');
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    await expect(service.cleanup()).resolves.toBeUndefined();
  });

  it('rejects oversized details at the database boundary too', async () => {
    await service.record(event());
    const row = (await service.list({ limit: 1 })).items[0];
    await expect(
      source.getRepository(AuditLog).insert({ ...row, id: undefined, details: { raw: 'x'.repeat(4096) } }),
    ).rejects.toThrow('CHECK constraint');
  });

  it('bounds outstanding writes without an unbounded queue', async () => {
    const receipts = await Promise.all(Array.from({ length: 40 }, () => service.record(event())));
    expect(receipts.filter((r) => r.status === 'recorded')).toHaveLength(8);
    expect(await source.getRepository(AuditLog).count()).toBe(8);
  });

  it('persists validated settings across store and service restarts, and fails closed on read failure', async () => {
    expect(await readAuditSettings(store)).toEqual(config);
    const settings = new SettingsService(null, store, null);
    await expect(settings.updateAuditSettings({ retention_days: 0 })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ domains: ['unknown'] as never })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ enabled: null })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ secret: 'never' } as never)).rejects.toThrow();
    await settings.updateAuditSettings({ enabled: false, domains: [], retention_days: 2 });
    await service.onModuleDestroy();
    store = new SettingsStoreService(source.getRepository(Setting), null);
    expect(await readAuditSettings(store)).toEqual({ enabled: false, domains: [], retention_days: 2 });
    service = new AuditService(source, store);
    await service.onModuleInit();
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    await settings.updateAuditSettings({ enabled: true, domains: ['wago'] });
    jest.spyOn(store, 'getPlainSetting').mockRejectedValue(new Error('private failure'));
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    await expect(service.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
  });

  it('applies retention setting changes to reads immediately and rejects malformed persisted settings', async () => {
    await service.record(event());
    const row = (await service.list({ limit: 1 })).items[0];
    await source.getRepository(AuditLog).insert({ ...row, id: undefined, at: new Date(Date.now() - 3 * 86400000) });
    expect((await service.list({ limit: 10 })).items).toHaveLength(2);
    const settings = new SettingsService(null, store, null);
    await settings.updateAuditSettings({ retention_days: 2 });
    expect((await service.list({ limit: 10 })).items).toHaveLength(1);
    expect(await source.getRepository(AuditLog).count()).toBe(2);
    for (const invalid of ['null', '"private"', '0']) {
      await store.setPlainSetting('audit', 'retention_days', invalid);
      expect(await service.record(event())).toEqual({ status: 'unavailable' });
      await expect(service.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
      await service.cleanup();
      expect(await source.getRepository(AuditLog).count()).toBe(2);
    }
  });

  it('bounds admission before settings awaits and recovers after settings failure', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = jest.spyOn(store, 'getPlainSetting').mockImplementation(async () => {
      await gate;
      throw new Error('private');
    });
    const pending = Array.from({ length: 8 }, () => service.record(event()));
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    expect(read).toHaveBeenCalledTimes(24);
    release();
    expect((await Promise.all(pending)).every((receipt) => receipt.status === 'unavailable')).toBe(true);
    read.mockRestore();
    expect(await service.record(event())).toEqual({ status: 'recorded' });
  });

  it('drains multiple bounded retention batches and filters event prefixes and time windows', async () => {
    await service.record(event());
    const row = (await service.list({ limit: 1 })).items[0];
    for (let batch = 0; batch < 3; batch++) {
      await source
        .getRepository(AuditLog)
        .insert(Array.from({ length: 800 }, () => ({ ...row, id: undefined, at: new Date(0) })));
    }
    expect(await source.getRepository(AuditLog).count()).toBe(2401);
    expect((await service.list({ limit: 10 })).items).toHaveLength(1);
    await service.cleanup();
    expect(await source.getRepository(AuditLog).count()).toBe(1);
    expect(
      (await service.list({ limit: 10, eventPrefix: 'wago.pub', from: row.at.toISOString(), to: row.at.toISOString() }))
        .items,
    ).toHaveLength(1);
    expect((await service.list({ limit: 10, eventPrefix: 'wago.commissioning.' })).items).toHaveLength(0);
    expect((await service.list({ limit: 10, to: new Date(0).toISOString() })).items).toHaveLength(0);
  });

  it('declines writes under SQLite contention within a deadline and recovers', async () => {
    const lock = await new DataSource({ type: 'sqlite', database: source.options.database }).initialize();
    try {
      await lock.query('BEGIN IMMEDIATE');
      const start = Date.now();
      const receipts = await Promise.all(Array.from({ length: 8 }, () => service.record(event())));
      expect(receipts.every((receipt) => receipt.status === 'unavailable')).toBe(true);
      expect(Date.now() - start).toBeLessThan(2500);
      await lock.query('ROLLBACK');
      expect(await service.record(event())).toEqual({ status: 'recorded' });
    } finally {
      await lock.destroy();
    }
  });

  it('enforces HTTP session permissions, token ceilings, query validation and persisted settings updates', async () => {
    const ownerPermissions = new Set(['system.audit.read', 'system.settings.manage', 'users.api-tokens.manage']);
    const settings = new SettingsService(null, store, null);
    const module = await Test.createTestingModule({
      controllers: [AuditController, SettingsController],
      providers: [
        SessionStrategy,
        { provide: AuditService, useValue: service },
        { provide: SettingsService, useValue: settings },
        {
          provide: SessionService,
          useValue: { validateSession: async (token: string) => (token === 'session' ? { id: 42 } : null) },
        },
        { provide: TwoFactorService, useValue: { getStatus: async () => ({ required: false }) } },
        { provide: RbacService, useValue: { getEffectivePermissions: async () => ownerPermissions } },
        {
          provide: ApiTokenService,
          useValue: {
            authenticate: async (token: string) => {
              if (!['audit-token', 'settings-token'].includes(token)) return null;
              return {
                user: { id: 42 },
                apiToken: {
                  id: 9,
                  permissionKeys: [token === 'audit-token' ? 'system.audit.read' : 'system.settings.manage'],
                },
              };
            },
          },
        },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    try {
      await app.listen(0, '127.0.0.1');
      await service.record(event());
      const server = app.getHttpServer();
      await request(server).get('/api/admin/audit-log').expect(401);
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer invalid').expect(401);
      await request(server).get('/api/admin/audit-log').set('Cookie', 'auth-session=session').expect(200);
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer audit-token').expect(200);
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer settings-token').expect(403);
      await request(server).get('/api/settings/audit').set('Authorization', 'Bearer audit-token').expect(403);
      await request(server)
        .get('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .expect(200, config);
      ownerPermissions.delete('system.audit.read');
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer audit-token').expect(403);
      await request(server).get('/api/admin/audit-log').set('Cookie', 'auth-session=session').expect(403);
      ownerPermissions.add('system.audit.read');
      for (const query of [
        'eventPrefix=wago.%25',
        'from=invalid',
        'from=2026-W01-1',
        'from=2026-09-02T00:00:00Z&to=2026-09-01T00:00:00Z',
        'limit=101',
        'raw=secret',
      ]) {
        await request(server)
          .get('/api/admin/audit-log?' + query)
          .set('Cookie', 'auth-session=session')
          .expect(400);
      }
      await request(server)
        .get('/api/admin/audit-log?eventPrefix=wago.pub&from=2020-01-01T00:00:00Z')
        .set('Cookie', 'auth-session=session')
        .expect(200)
        .expect(({ body }) => expect(body.items).toHaveLength(1));
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({ enabled: false, retention_days: 3, domains: [] })
        .expect(200, { enabled: false, retention_days: 3, domains: [] });
      expect(await service.record(event())).toEqual({ status: 'unavailable' });
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({ retention_days: 4 })
        .expect(200, { enabled: false, retention_days: 4, domains: [] });
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({})
        .expect(200, { enabled: false, retention_days: 4, domains: [] });
      for (const body of [
        { enabled: null },
        { enabled: 'false' },
        { retention_days: '90' },
        { domains: ['unknown'] },
        { retention_days: 0 },
        { secret: 'private' },
      ]) {
        await request(server)
          .patch('/api/settings/audit')
          .set('Authorization', 'Bearer settings-token')
          .send(body)
          .expect(400);
      }
      ownerPermissions.delete('users.api-tokens.manage');
      await request(server).get('/api/settings/audit').set('Authorization', 'Bearer settings-token').expect(401);
      const restartedStore = new SettingsStoreService(source.getRepository(Setting), null);
      expect(await readAuditSettings(restartedStore)).toEqual({ enabled: false, retention_days: 4, domains: [] });
    } finally {
      await app.close();
    }
  });

  it('uses one safe event snapshot before settings awaits and waits safely for shutdown', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalRead = store.getPlainSetting.bind(store);
    const read = jest.spyOn(store, 'getPlainSetting').mockImplementation(async (parent, key) => {
      await gate;
      return originalRead(parent, key);
    });
    const input = event();
    const pending = service.record(input);
    input.principal.userId = 99;
    input.details.revision = 999;
    release();
    expect(await pending).toEqual({ status: 'recorded' });
    read.mockRestore();
    expect((await service.list({ limit: 1 })).items[0]).toMatchObject({ actorId: 42, details: { revision: 2 } });
    const writes = Array.from({ length: 8 }, () => service.record(event()));
    const shutdown = service.onModuleDestroy();
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    await Promise.all([...writes, shutdown]);
    await expect(service.list({ limit: 1 })).rejects.toThrow('Audit storage unavailable');
  });

  it('resolves audit from a plugin context registered through full PluginModule.forRoot', async () => {
    let context: PluginContext;
    @Module({})
    class FixturePlugin {}
    @Module({ providers: [{ provide: SettingsStoreService, useValue: store }], exports: [SettingsStoreService] })
    class FixtureSettingsModule {}
    @Module({})
    class FixtureMqttModule {}
    const originalPluginPath = PluginService.PLUGIN_PATH;
    PluginService.PLUGIN_PATH = directory;
    const quarantine = jest.spyOn(PluginService, 'quarantinePlugin').mockImplementation(() => undefined);
    const manifests = jest.spyOn(PluginService, 'getPlugins').mockReturnValue([
      {
        id: event().pluginId,
        name: 'audit-fixture',
        version: '1.0.0',
        pluginDirectory: directory,
        main: { backend: { directory, entryPoint: 'fixture.js' } },
        permissions: [],
      } as never,
    ]);
    const quarantined = jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
    const markLoaded = jest.spyOn(PluginService, 'markPluginAsLoaded').mockImplementation(() => undefined);
    const loader = jest.spyOn(pluginLoader, 'loadPluginEntryExports').mockReturnValue({
      default: {
        register: (value: PluginContext) => {
          context = value;
          return { module: FixturePlugin };
        },
      },
    });
    try {
      const builder = Test.createTestingModule({ imports: [AuditModule, PluginModule.forRoot()] })
        .overrideModule(SettingsModule)
        .useModule(FixtureSettingsModule)
        .overrideModule(MqttModule)
        .useModule(FixtureMqttModule);
      for (const provider of [
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginClassificationService,
      ]) {
        builder.overrideProvider(provider).useValue({ clearPlugin: jest.fn() });
      }
      const module = await builder
        .useMocker((token) => {
          if (token === DataSource) return source;
          if (token === EventEmitter2) return new EventEmitter2();
          return {};
        })
        .compile();
      try {
        await module.init();
        expect(context).toBeDefined();
        expect(await context.audit.record(event())).toEqual({ status: 'recorded' });
        expect((await module.get(AuditService).list({ limit: 1 })).items[0].pluginId).toBe(event().pluginId);
      } finally {
        await module.close();
      }
    } finally {
      PluginService.PLUGIN_PATH = originalPluginPath;
      quarantine.mockRestore();
      loader.mockRestore();
      manifests.mockRestore();
      quarantined.mockRestore();
      markLoaded.mockRestore();
    }
  });

  it('resolves the SDK provider through the module and actual bridge', async () => {
    @Module({ providers: [{ provide: SettingsStoreService, useValue: store }], exports: [SettingsStoreService] })
    class FixtureSettingsModule {}
    const module = await Test.createTestingModule({ imports: [AuditModule] })
      .overrideModule(SettingsModule)
      .useModule(FixtureSettingsModule)
      .useMocker((token) => (token === DataSource ? source : undefined))
      .compile();
    await module.init();
    const sink = module.get<AuditService>(PLUGIN_AUDIT_HOST_PROVIDER);
    expect(sink).toBe(module.get(AuditService));
    const bridge = createPluginAuditContext('abcdefghijklmnopqrstu', () => sink);
    expect(await bridge.record(event())).toEqual({ status: 'recorded' });
    await module.close();
  });
});

describe('audit policy and authorization', () => {
  it('accepts every current controller and f136365b commissioning action with the correct subject', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(
        projectAuditEvent({
          ...event(),
          action,
          details: {},
          subject: { id: 1, type: action.startsWith('wago.commissioning.') ? 'wago.commissioning' : 'wago.controller' },
        }),
      ).toBeTruthy();
    }
    expect(
      projectAuditEvent({
        ...event(),
        action: 'wago.profile_change',
        details: { profileId: '  自定义  ', profileVersion: 1, 'before.physicalPointCount': 0 },
      }),
    ).toBeTruthy();
  });

  it('rejects arbitrary events, cross-event details, unsafe values and incorrect principals', () => {
    for (const override of [
      { action: 'wago.telemetry' },
      { action: 'wago.toString' },
      { details: { raw: 'payload' } },
      { details: { channelId: 'valid-but-wrong-event' } },
      { details: { revision: Infinity } },
      { action: 'wago.profile_change', details: { profileId: 'x'.repeat(161) } },
      { principal: { userId: 1, authenticationMethod: 'api-token' } },
      { subject: { type: 'wago.commissioning', id: 1 } },
    ])
      expect(projectAuditEvent({ ...event(), ...override } as ReturnType<typeof event>)).toBeNull();
  });

  it('uses the effective permission guard for both session and token ceilings', () => {
    const guard = new EffectivePermissionsGuard(new Reflector());
    const context = (user: unknown) =>
      ({
        getHandler: () => AuditController.prototype.list,
        getClass: () => AuditController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(context(undefined))).toThrow(UnauthorizedException);
    for (const authenticationMethod of ['session', 'api-token']) {
      expect(() =>
        guard.canActivate(
          context({ id: 1, authenticationMethod, effectivePermissions: new Set(['system.settings.manage']) }),
        ),
      ).toThrow(ForbiddenException);
      expect(
        guard.canActivate(
          context({ id: 1, authenticationMethod, effectivePermissions: new Set(['system.audit.read']) }),
        ),
      ).toBeTruthy();
    }
  });

  it('validates paging bounds and rejects unrecognized query fields', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const query of [{ limit: '101' }, { beforeId: '-1' }, { raw: 'secret' }]) {
      await expect(pipe.transform(query, { type: 'query', metatype: AuditQueryDto })).rejects.toThrow();
    }
    expect(await pipe.transform({ limit: '5' }, { type: 'query', metatype: AuditQueryDto })).toEqual({ limit: 5 });
  });
});

it('upgrades the full registered schema, reverts the audit migration, and reapplies it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'audit-upgrade-'));
  const prior = Object.values(migrations).filter((migration) => migration !== DurableAudit1783700000000);
  const database = join(directory, 'upgrade.sqlite');
  let source = new DataSource({ type: 'sqlite', database, entities: Object.values(entities), migrations: prior });
  try {
    await source.initialize();
    await source.runMigrations();
    await source.destroy();
    source = new DataSource({
      type: 'sqlite',
      database,
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    });
    await source.initialize();
    const applied = await source.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual(['DurableAudit1783700000000']);
    expect(source.hasMetadata(AuditLog)).toBeTruthy();
    expect(await source.query('PRAGMA foreign_key_list(audit_log)')).toEqual([]);
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toEqual([]);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual(['DurableAudit1783700000000']);
  } finally {
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

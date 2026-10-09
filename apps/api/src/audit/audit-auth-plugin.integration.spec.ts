import { Setting } from '@attraccess/database-entities';
import { EffectivePermissionsGuard, PLUGIN_AUDIT_HOST_PROVIDER, PluginContext } from '@attraccess/plugins-backend-sdk';
import { ExecutionContext, ForbiddenException, Module, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { MqttModule } from '../mqtt/mqtt.module';
import { NpmPluginService } from '../plugin-system/npm-plugin.service';
import { createPluginAuditContext } from '../plugin-system/runtime/audit-context';
import { registerPluginAuditDomains, resetPluginAuditRegistry } from '../plugin-system/audit/audit-registry';
import { PluginClassificationService } from '../plugin-system/plugin-classification.service';
import { PluginEventsService } from '../plugin-system/plugin-events.service';
import * as pluginLoader from '../plugin-system/runtime/module-loader';
import { PluginMqttService } from '../plugin-system/plugin-mqtt.service';
import { PluginSandboxService } from '../plugin-system/plugin-sandbox.service';
import { PluginModule } from '../plugin-system/plugin.module';
import { PluginService } from '../plugin-system/plugin.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsController } from '../settings/settings.controller';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { SessionService } from '../users-and-auth/auth/session.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { AuditQueryDto } from './dto/audit-query.dto';
import { readAuditSettings } from './audit.config';
import { AuditController } from './audit.controller';
import { AuditModule } from './audit.module';
import { AuditService } from './audit.service';
import { demoDomain, setupAuditDatabase } from './audit.test-fixture';
describe('durable audit SQLite', () => {
  const fixture = setupAuditDatabase();
  it('enforces HTTP session permissions, token ceilings, query validation and persisted settings updates', async () => {
    const ownerPermissions = new Set(['system.audit.read', 'system.settings.manage', 'users.api-tokens.manage']);
    const settings = new SettingsService(null, fixture.store, null);
    const module = await Test.createTestingModule({
      controllers: [AuditController, SettingsController],
      providers: [
        SessionStrategy,
        { provide: AuditService, useValue: fixture.service },
        { provide: SettingsService, useValue: settings },
        {
          provide: SessionService,
          useValue: {
            authenticateSession: async (token: string) =>
              token === 'session' ? { user: { id: 42 }, session: { id: 'audit-fixture', ssoContext: null } } : null,
          },
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
      await fixture.service.record(fixture.event());
      await fixture.service.recordResource({
        action: 'resource_group.resource_added',
        actorId: 42,
        subjectType: 'resource_group',
        subjectId: 7,
        details: { resourceId: 3 },
      });
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
        .expect(200, fixture.config);
      ownerPermissions.delete('system.audit.read');
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer audit-token').expect(403);
      await request(server).get('/api/admin/audit-log').set('Cookie', 'auth-session=session').expect(403);
      ownerPermissions.add('system.audit.read');
      for (const query of [
        'eventPrefix=demo.%25',
        'domain=Demo',
        'subjectType=demo..device',
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
        .get('/api/admin/audit-log?eventPrefix=demo.pub&from=2020-01-01T00:00:00Z')
        .set('Cookie', 'auth-session=session')
        .expect(200)
        .expect(({ body }) => expect(body.items).toHaveLength(1));
      await request(server)
        .get('/api/admin/audit-log?action=resource_group.resource_added&subjectType=resource_group&domain=resource')
        .set('Cookie', 'auth-session=session')
        .expect(200)
        .expect(({ body }) => expect(body.items).toHaveLength(1));
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({ enabled: false, retention_days: 3, domains: [] })
        .expect(200, { enabled: false, retention_days: 3, domains: [], plugin_domains_disabled: [] });
      expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({ retention_days: 4 })
        .expect(200, { enabled: false, retention_days: 4, domains: [], plugin_domains_disabled: [] });
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({})
        .expect(200, { enabled: false, retention_days: 4, domains: [], plugin_domains_disabled: [] });
      for (const body of [
        { enabled: null },
        { enabled: 'false' },
        { retention_days: '90' },
        { domains: ['unknown'] },
        { plugin_domains_disabled: ['Not A Domain'] },
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
      const restartedStore = new SettingsStoreService(fixture.source.getRepository(Setting), null);
      expect(await readAuditSettings(restartedStore)).toEqual({
        enabled: false,
        retention_days: 4,
        domains: [],
        plugin_domains_disabled: [],
      });
    } finally {
      await app.close();
    }
  });

  it('resolves audit from a plugin context registered through full PluginModule.forRoot', async () => {
    let context: PluginContext;
    @Module({})
    class FixturePlugin {}
    @Module({
      providers: [{ provide: SettingsStoreService, useValue: fixture.store }],
      exports: [SettingsStoreService],
    })
    class FixtureSettingsModule {}
    @Module({})
    class FixtureMqttModule {}
    const originalPluginPath = PluginService.PLUGIN_PATH;
    PluginService.PLUGIN_PATH = fixture.directory;
    const quarantine = jest.spyOn(PluginService, 'quarantinePlugin').mockImplementation(() => undefined);
    const manifests = jest.spyOn(PluginService, 'getPlugins').mockReturnValue([
      {
        id: fixture.event().pluginId,
        name: 'audit-fixture',
        version: '1.0.0',
        pluginDirectory: fixture.directory,
        main: { backend: { directory: fixture.directory, entryPoint: 'fixture.js' } },
        permissions: [],
      } as never,
    ]);
    const quarantined = jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
    const markLoaded = jest.spyOn(PluginService, 'markPluginAsLoaded').mockImplementation(() => undefined);
    // The host registers plugin-declared audit domains during forRoot; drop the
    // beforeEach registration so this exercises the real PluginModule wiring.
    resetPluginAuditRegistry();
    const loader = jest.spyOn(pluginLoader, 'loadPluginEntryExports').mockReturnValue({
      default: {
        auditDomains: [fixture.demoDomain],
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
          if (token === DataSource) return fixture.source;
          if (token === EventEmitter2) return new EventEmitter2();
          return {};
        })
        .compile();
      try {
        await module.init();
        expect(context).toBeDefined();
        expect(await context.audit.record(fixture.event())).toEqual({ status: 'recorded' });
        expect((await module.get(AuditService).list({ limit: 1 })).items[0].pluginId).toBe(fixture.event().pluginId);
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
    @Module({
      providers: [{ provide: SettingsStoreService, useValue: fixture.store }],
      exports: [SettingsStoreService],
    })
    class FixtureSettingsModule {}
    const module = await Test.createTestingModule({ imports: [AuditModule] })
      .overrideModule(SettingsModule)
      .useModule(FixtureSettingsModule)
      .useMocker((token) => (token === DataSource ? fixture.source : undefined))
      .compile();
    await module.init();
    const sink = module.get<AuditService>(PLUGIN_AUDIT_HOST_PROVIDER);
    expect(sink).toBe(module.get(AuditService));
    const bridge = createPluginAuditContext('abcdefghijklmnopqrstu', () => sink);
    expect(await bridge.record(fixture.event())).toEqual({ status: 'recorded' });
    await module.close();
  });
});
describe('audit authorization and query validation', () => {
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

  it('validates audit query bounds and allows the registered resource and billing filters', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const query of [{ limit: '101' }, { beforeId: '-1' }, { raw: 'secret' }]) {
      await expect(pipe.transform(query, { type: 'query', metatype: AuditQueryDto })).rejects.toThrow();
    }
    expect(await pipe.transform({ limit: '5' }, { type: 'query', metatype: AuditQueryDto })).toEqual({ limit: 5 });
    await expect(
      pipe.transform({ eventPrefix: 'maintenance_schedule.' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ eventPrefix: 'maintenance_schedule.' });
    await expect(
      pipe.transform({ eventPrefix: 'supervision.' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ eventPrefix: 'supervision.' });
    const billingFilters = {
      domain: 'billing',
      eventPrefix: 'billing.transaction.',
      action: 'billing.transaction.updated',
      subjectType: 'billing.transaction',
    };
    await expect(pipe.transform(billingFilters, { type: 'query', metatype: AuditQueryDto })).resolves.toMatchObject(
      billingFilters,
    );
    await expect(
      pipe.transform({ domain: 'sso', action: 'sso.provider.created' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ domain: 'sso', action: 'sso.provider.created' });
    await expect(
      pipe.transform(
        {
          eventPrefix: 'resource_group.',
          action: 'introduction.granted',
          subjectType: 'resource_group',
          domain: 'resource',
        },
        { type: 'query', metatype: AuditQueryDto },
      ),
    ).resolves.toMatchObject({ action: 'introduction.granted', subjectType: 'resource_group', domain: 'resource' });
    await expect(
      pipe.transform(
        {
          eventPrefix: 'billing.',
          action: 'billing.transaction.created',
          subjectType: 'billing.transaction',
          domain: 'billing',
        },
        { type: 'query', metatype: AuditQueryDto },
      ),
    ).resolves.toMatchObject({
      action: 'billing.transaction.created',
      subjectType: 'billing.transaction',
      domain: 'billing',
    });
    for (const subjectType of ['project', 'project.member', 'project.invitation']) {
      await expect(
        pipe.transform({ domain: 'project', subjectType }, { type: 'query', metatype: AuditQueryDto }),
      ).resolves.toMatchObject({ domain: 'project', subjectType });
    }
    // Plugin-contributed filter values validate against the live registry.
    resetPluginAuditRegistry();
    registerPluginAuditDomains({ name: 'query-fixture', id: 'q'.repeat(21) }, [demoDomain]);
    try {
      const pluginFilters = {
        domain: 'demo',
        eventPrefix: 'demo.commissioning.',
        action: 'demo.commissioning.install',
        subjectType: 'demo.device',
      };
      await expect(pipe.transform(pluginFilters, { type: 'query', metatype: AuditQueryDto })).resolves.toMatchObject(
        pluginFilters,
      );
      for (const query of [
        { domain: 'Demo' },
        { domain: 'demo-device' },
        { domain: 'unregistered' },
        { action: 'demo.Action' },
        { action: '.demo' },
        { action: 'demo.unregistered_action' },
        { subjectType: 'demo..device' },
        { subjectType: 'demo.unregistered' },
        { eventPrefix: 'demo.%' },
        { eventPrefix: 'unregistered.' },
      ]) {
        await expect(pipe.transform(query, { type: 'query', metatype: AuditQueryDto })).rejects.toThrow();
      }
    } finally {
      resetPluginAuditRegistry();
    }
  });
});

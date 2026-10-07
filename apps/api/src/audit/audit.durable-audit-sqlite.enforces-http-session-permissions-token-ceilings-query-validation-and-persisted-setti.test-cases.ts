import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { SessionService } from '../users-and-auth/auth/session.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';
import { SettingsController } from '../settings/settings.controller';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { Setting } from '@attraccess/database-entities';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { readAuditSettings } from './audit.config';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
export function registerEnforcesHttpSessionPermissionsTokenCeilingsQueryValidationAndPersistedSettiCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
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
}

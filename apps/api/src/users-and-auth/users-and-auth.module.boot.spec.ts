import { entities } from '@attraccess/database-entities';
import type { InjectionToken } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { IdentityAuditService } from '../audit/identity-audit.service';
import { SsoAuditService } from '../audit/sso-audit.service';
import { ApprovedOriginsService } from '../common/security/approved-origins.service';
import { SecurityModule } from '../common/security/security.module';
import appConfiguration from '../config/app.config';
import sessionConfig from '../config/session.config';
import storageConfigObject from '../config/storage.config';
import valkeyConfig from '../config/valkey.config';
import { MetricsModule } from '../metrics/metrics.module';
import { ValkeyModule } from '../valkey/valkey.module';
import { AuthController } from './auth/auth.controller';
import { SsoLogoutService } from './auth/sso/sso-logout.service';
import { SessionPermissionSync } from './auth/sso/session-permission-sync';
import { SsoSessionPermissionSyncService } from './auth/sso/session-permission-sync.service';
import { SessionService } from './auth/session.service';
import { TwoFactorService } from './auth/two-factor.service';
import { ApiTokenService } from './auth/api-token/api-token.service';
import { RbacService } from './rbac/rbac.service';
import { AuthAuditLogger } from './rate-limiting/auth-audit.logger';
import { CookieConfigService } from '../common/services/cookie-config.service';
import { UsersService } from './users/users.service';
import { BruteForceProtectionService } from './rate-limiting/brute-force.service';
import { SessionStrategy } from './strategies/session.strategy';
import { UsersAndAuthModule } from './users-and-auth.module';

// Config factories validate the environment when ConfigModule loads, not on import.
process.env.AUTH_SESSION_SECRET ??= 'boot-spec-session-secret-0123456789abcdef';

const infrastructure = () => [
  ConfigModule.forRoot({ load: [appConfiguration, storageConfigObject, sessionConfig, valkeyConfig], isGlobal: true }),
  EventEmitterModule.forRoot(),
  TypeOrmModule.forRoot({
    type: 'sqlite',
    database: ':memory:',
    synchronize: true,
    entities: Object.values(entities),
  }),
  MetricsModule,
  ValkeyModule,
];

const compile = (...modules: unknown[]) =>
  Test.createTestingModule({ imports: [...infrastructure(), ...modules] as never[] }).compile();

describe('UsersAndAuthModule boot (required security and audit collaborators)', () => {
  describe('with the real module and its global providers', () => {
    let moduleRef: TestingModule;

    beforeAll(async () => {
      moduleRef = await compile(AuditModule, SecurityModule, UsersAndAuthModule);
    });

    afterAll(async () => {
      await moduleRef?.close();
    });

    it('resolves AuthController with every collaborator defined', () => {
      const controller = moduleRef.get(AuthController);
      const collaborators = controller as unknown as Record<string, unknown>;

      expect(collaborators.identityAudit).toBeInstanceOf(IdentityAuditService);
      expect(collaborators.ssoLogout).toBeInstanceOf(SsoLogoutService);
      expect(collaborators.ssoPermissionSync).toBeInstanceOf(SsoSessionPermissionSyncService);
      expect(collaborators.approvedOrigins).toBeInstanceOf(ApprovedOriginsService);
    });

    it('resolves SessionStrategy with the permission sync defined', () => {
      const strategy = moduleRef.get(SessionStrategy) as unknown as Record<string, unknown>;

      expect(strategy.ssoPermissionSync).toBeInstanceOf(SsoSessionPermissionSyncService);
    });

    it('provides the SSO audit service to the permission sync', () => {
      const sync = moduleRef.get(SessionPermissionSync) as unknown as Record<string, unknown>;

      expect(sync.ssoAudit).toBeInstanceOf(SsoAuditService);
    });
  });

  it('fails to compile without the AuditModule', async () => {
    await expect(compile(SecurityModule, UsersAndAuthModule)).rejects.toThrow(/IdentityAuditService/);
  });

  it('fails to compile without the SecurityModule', async () => {
    await expect(compile(AuditModule, UsersAndAuthModule)).rejects.toThrow(/ApprovedOriginsService/);
  });

  it('fails to compile SessionStrategy and AuthController without a SessionPermissionSync provider', async () => {
    const stub = (provide: InjectionToken) => ({ provide, useValue: {} });
    const compileWith = (withSync: boolean) =>
      Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          SessionStrategy,
          stub(SessionService),
          stub(TwoFactorService),
          stub(RbacService),
          stub(ApiTokenService),
          stub(AuthAuditLogger),
          stub(CookieConfigService),
          stub(IdentityAuditService),
          stub(SsoLogoutService),
          stub(ApprovedOriginsService),
          stub(UsersService),
          stub(BruteForceProtectionService),
          ...(withSync ? [stub(SessionPermissionSync)] : []),
        ],
      }).compile();

    await expect(compileWith(true)).resolves.toBeDefined();
    await expect(compileWith(false)).rejects.toThrow(/SessionPermissionSync/);
  });
});

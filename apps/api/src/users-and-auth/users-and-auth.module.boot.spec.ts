import { entities } from '@attraccess/database-entities';
import type { InjectionToken, ModuleMetadata, Type } from '@nestjs/common';
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
import { ValkeyClientService, ValkeyModule } from '../valkey/valkey.module';
import { AuthController } from './auth/auth.controller';
import { SsoLogoutService } from './auth/sso/sso-logout.service';
import { SessionPermissionSync } from './auth/sso/session-permission-sync';
import { SsoSessionPermissionSyncService } from './auth/sso/session-permission-sync.service';
import { SessionStrategy } from './strategies/session.strategy';
import { UsersAndAuthModule } from './users-and-auth.module';

// Config factories validate the environment when ConfigModule loads, not on import.
process.env.AUTH_SESSION_SECRET ??= 'boot-spec-session-secret-0123456789abcdef';

// Stands in for the global modules AppModule (app/app.module.ts) supplies; keep the two in step.
const infrastructure = (): NonNullable<ModuleMetadata['imports']> => [
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

// Valkey is external infrastructure: never connect, even when VALKEY_URL is set locally.
const compile = (...modules: NonNullable<ModuleMetadata['imports']>) =>
  Test.createTestingModule({ imports: [...infrastructure(), ...modules] })
    .overrideProvider(ValkeyClientService)
    .useValue({ client: null, onApplicationShutdown: async () => undefined })
    .compile();

/** Compiles `target` alone, mocking every dependency except `missing`. */
const compileWithout = (target: Type, missing?: InjectionToken) =>
  Test.createTestingModule(target === AuthController ? { controllers: [target] } : { providers: [target] })
    .useMocker((token) => (token === missing ? undefined : {}))
    .compile();

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

  // Each class on its own, so a regression in one of them cannot hide behind another.
  const requiredCollaborators: Array<[Type, Array<InjectionToken & { name: string }>]> = [
    [AuthController, [IdentityAuditService, SsoLogoutService, SessionPermissionSync, ApprovedOriginsService]],
    [SessionStrategy, [SessionPermissionSync]],
    [SsoSessionPermissionSyncService, [SsoAuditService]],
  ];

  describe.each(requiredCollaborators.map(([target, required]) => [target.name, target, required] as const))(
    '%s',
    (_name, target, required) => {
      it('compiles when every dependency is available', async () => {
        await expect(compileWithout(target)).resolves.toBeDefined();
      });

      it.each(required.map((token) => [token.name, token] as const))(
        'fails to compile without %s',
        async (name, token) => {
          await expect(compileWithout(target, token)).rejects.toThrow(
            new RegExp(`dependencies of the ${target.name}[\\s\\S]*argument ${name}`),
          );
        },
      );
    },
  );
});

import { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsService } from '../../../settings/settings.service';
import { OidcTokenVerifier } from '../../../users-and-auth/auth/sso/oidc/oidc-token-verifier.service';
import { EncryptionService } from '../../../encryption/encryption.service';
import {
  AuthenticationDetail,
  ResourceUsage,
  Session,
  User,
} from '@attraccess/database-entities';
import { SSOProviderType } from '@attraccess/application-models';
import type { ConfigService } from '@nestjs/config';
import type { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { AppConfigType } from '../../../config/app.config';
import type { EmailService } from '../../../email/email.service';
import { TokenHashService } from '../../../encryption/token-hash.service';
import type { LicenseService } from '../../../license/license.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { AuthService } from '../../../users-and-auth/auth/auth.service';
import { PasswordPolicyService } from '../../../users-and-auth/password-policy/password-policy.service';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import { TransactionContextResolver } from '../../../database/adapters/transaction-context';
import { TypeOrmCredentialStore } from '../../../database/adapters/auth/typeorm-credential.store';
import { SsoAccountResolver } from '../../../users-and-auth/auth/sso/account-resolution/sso-account-resolver.service';
import { TypeOrmRbacStore } from '../../../database/adapters/users/typeorm-rbac.store';
import { TransactionContextResolver } from '../../../database/adapters/transaction-context';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { composeUsersService } from '../../../users-and-auth/users/fixtures/compose.test-fixture';
export function createOidcTestServices(dataSource: DataSource) {
  // ── 3. Build real services backed by SQLite ───────────────────────────────
  const userRepo = dataSource.getRepository(User);
  const authDetailRepo = dataSource.getRepository(AuthenticationDetail);
  const sessionRepo = dataSource.getRepository(Session);
  const resourceUsageRepo = dataSource.getRepository(ResourceUsage);

  const mockConfigService = {
    get: (key: string): AppConfigType | undefined => {
      if (key === 'app') return { AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET } as AppConfigType;
      return undefined;
    },
  } as unknown as ConfigService;

  const mockEmailService = {
    sendEmailFromTemplate: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmailService;

  const mockMetricsService = {
    authSsoLoginTotal: { inc: jest.fn() },
    authSsoLoginFailuresTotal: { inc: jest.fn() },
    authActiveSessions: { set: jest.fn() },
    usersTotal: { set: jest.fn(), inc: jest.fn(), dec: jest.fn() },
    usersRegisteredTotal: { inc: jest.fn() },
    usersLocaleSyncsTotal: { inc: jest.fn() },
    usersPerLocale: { set: jest.fn(), inc: jest.fn(), dec: jest.fn() },
  } as unknown as MetricsService;

  const mockLicenseService = {
    verifyLicense: jest.fn().mockResolvedValue(undefined),
    getLicenseData: jest.fn().mockResolvedValue({
      valid: true,
      modules: Object.values(SSOProviderType),
      usageLimits: { users: Infinity, resources: Infinity },
    }),
  } as unknown as LicenseService;

  const tokenHashService = new TokenHashService(mockConfigService);
  const rbacUow = unitOfWorkFor(dataSource);
  const rbacService = new RbacService(
    new TypeOrmRbacStore(dataSource, new TransactionContextResolver(dataSource, rbacUow)),
    rbacUow,
    new EventEmitter2(),
    null,
    { record: jest.fn().mockResolvedValue({ status: 'recorded' }) } as never,
  );
  const usersService = composeUsersService(
    userRepo,
    authDetailRepo,
    sessionRepo,
    resourceUsageRepo,
    mockLicenseService,
    mockEmailService,
    dataSource,
    tokenHashService,
    mockMetricsService,
    rbacService,
    { getDefaultLanguage: async () => 'en' } as SettingsService,
  );
  const authService = new AuthService(
    mockEmailService,
    new TypeOrmCredentialStore(authDetailRepo, new TransactionContextResolver(dataSource, unitOfWorkFor(dataSource))),
    usersService,
    tokenHashService,
    mockMetricsService,
    { getPolicy: async () => ({ historySize: 0 }) } as unknown as PasswordPolicyService,
  );

  const verifier = new OidcTokenVerifier();
  const encryption = new EncryptionService(mockConfigService);
  const resolver = new SsoAccountResolver(usersService, authService);
  const mockModuleRef = {
    get: (token: unknown): unknown => {
      if (token === SsoAccountResolver) return resolver;
      if (token === UsersService) return usersService;
      if (token === AuthService) return authService;
      if (token === RbacService) return rbacService;
      if (token === MetricsService) return mockMetricsService;
      if (token === OidcTokenVerifier) return verifier;
      if (token === EncryptionService) return encryption;
      return null;
    },
  } as unknown as ModuleRef;

  return { userRepo, rbacService, usersService, authService, mockModuleRef };
}

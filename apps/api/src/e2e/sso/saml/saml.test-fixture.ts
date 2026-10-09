/**
 * SSO SAML integration e2e tests.
 *
 * Testing approach
 * ────────────────
 * The Jest config mocks @node-saml/passport-saml (the passport layer) to avoid
 * native-module issues in Jest. This test therefore exercises SSOSamlStrategy.validate()
 * directly — which is where ALL of our application logic lives (user creation, dedup,
 * permission sync, email attribute resolution).
 *
 * We pass realistic SAML Profile objects that mirror what @node-saml/passport-saml would
 * produce after successfully parsing and verifying a SAML assertion. Each profile is built
 * with the same fields that a real IdP (SimpleSAMLphp, Keycloak, ADFS …) would populate.
 *
 * Using testcontainers for full HTTP-level SAML flows (SAMLResponse POST → callback) is
 * blocked by the passport-saml mock. The correct home for that coverage is a Docker-based
 * smoke/integration test suite that runs outside Jest (no module mocking applies).
 */

import type { SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import {
  AuthenticationDetail,
  Permission,
  ResourceUsage,
  Role,
  RolePermission,
  SSOProviderType,
  Session,
  User,
  UserRole,
  entities,
} from '@attraccess/database-entities';
import type { ConfigService } from '@nestjs/config';
import type { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import type { AppConfigType } from '../../../config/app.config';
import type { EmailService } from '../../../email/email.service';
import { TokenHashService } from '../../../encryption/token-hash.service';
import type { LicenseService } from '../../../license/license.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { AuthService } from '../../../users-and-auth/auth/auth.service';
import { SSOSamlStrategy } from '../../../users-and-auth/auth/sso/saml/saml.strategy';
import type { SSOSamlRequest } from '../../../users-and-auth/auth/sso/saml/saml.types';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { UsersService } from '../../../users-and-auth/users/users.service';

jest.setTimeout(120_000);

// ── Minimal SAML profile factory ──────────────────────────────────────────────
// Mirrors the Profile type from @node-saml/passport-saml (mocked in jest config,
// so we build plain objects that match the shape the strategy expects).
function makeSamlProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nameID: 'saml-user-123',
    nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
    issuer: 'https://idp.example.com',
    email: 'samluser@example.com',
    ...overrides,
  };
}

function makeSamlConfig(overrides: Partial<SSOProviderSAMLConfiguration> = {}): SSOProviderSAMLConfiguration {
  return {
    id: 1,
    ssoProviderId: 1,
    entryPoint: 'https://idp.example.com/sso',
    issuer: 'https://sp.attraccess.example.com',
    certificate: 'PLACEHOLDER_CERT',
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: true,
    signRequest: false,
    forceAuthn: false,
    audience: null,
    emailAttributeKeys: ['email'],
    spSigningCertificate: null,
    spSigningKeyEncrypted: null,
    roleMappings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ssoProvider: null as unknown as SSOProviderSAMLConfiguration['ssoProvider'],
    ...overrides,
  } as SSOProviderSAMLConfiguration;
}

function makeSamlRequest(config: SSOProviderSAMLConfiguration, providerId = 1): SSOSamlRequest {
  return {
    ssoSamlOptions: {
      providerId,
      samlConfiguration: config,
      callbackUrl: `https://api.attraccess.example.com/api/auth/sso/SAML/${providerId}/callback`,
    },
  } as unknown as SSOSamlRequest;
}

// ── Shared test state ──────────────────────────────────────────────────────────
let dataSource: DataSource;

let usersService: UsersService;

let authService: AuthService;

let rbacService: RbacService;

let mockModuleRef: ModuleRef;

let userRepo: Repository<User>;

beforeAll(async () => {
  // ── Database setup ─────────────────────────────────────────────────────────
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'att-sso-saml-e2e-'));
  process.env.AUTH_SESSION_SECRET = 'sso-saml-e2e-test-secret-must-be-long';

  dataSource = new DataSource({
    type: 'sqlite',
    database: path.join(tmpRoot, 'attraccess.sqlite'),
    entities: Object.values(entities),
    synchronize: true,
  });
  await dataSource.initialize();

  // ── Build real services backed by SQLite ────────────────────────────────────
  userRepo = dataSource.getRepository(User);
  const authDetailRepo = dataSource.getRepository(AuthenticationDetail);
  const sessionRepo = dataSource.getRepository(Session);
  const resourceUsageRepo = dataSource.getRepository(ResourceUsage);
  const userRoleRepo = dataSource.getRepository(UserRole);
  const roleRepo = dataSource.getRepository(Role);
  const permissionRepo = dataSource.getRepository(Permission);
  const rolePermissionRepo = dataSource.getRepository(RolePermission);

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
  rbacService = new RbacService(
    userRoleRepo,
    roleRepo,
    permissionRepo,
    userRepo,
    rolePermissionRepo,
    new EventEmitter2(),
    null,
  );
  usersService = new UsersService(
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
  );
  authService = new AuthService(mockEmailService, authDetailRepo, usersService, tokenHashService, mockMetricsService);

  mockModuleRef = {
    get: (token: unknown): unknown => {
      if (token === UsersService) return usersService;
      if (token === AuthService) return authService;
      if (token === RbacService) return rbacService;
      if (token === MetricsService) return mockMetricsService;
      return null;
    },
  } as unknown as ModuleRef;
});

afterAll(async () => {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
});
export function registerSsoSamlStrategyValidateIntegrationE2eFixture() {
  let strategy: SSOSamlStrategy;

  beforeEach(() => {
    strategy = new SSOSamlStrategy(mockModuleRef);
  });
  return {
    get makeSamlProfile() {
      return makeSamlProfile;
    },
    get makeSamlConfig() {
      return makeSamlConfig;
    },
    get makeSamlRequest() {
      return makeSamlRequest;
    },
    get dataSource() {
      return dataSource;
    },
    get rbacService() {
      return rbacService;
    },
    get mockModuleRef() {
      return mockModuleRef;
    },
    get userRepo() {
      return userRepo;
    },
    get strategy() {
      return strategy;
    },
  };
}

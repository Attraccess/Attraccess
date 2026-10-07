import {
  AuthenticationDetail,
  Permission,
  ResourceUsage,
  Role,
  SSOProviderType,
  Session,
  User,
  UserRole,
} from '@attraccess/database-entities';
import type { ConfigService } from '@nestjs/config';
import type { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { AppConfigType } from '../config/app.config';
import type { EmailService } from '../email/email.service';
import { TokenHashService } from '../encryption/token-hash.service';
import type { LicenseService } from '../license/license.service';
import { MetricsService } from '../metrics/metrics.service';
import { AuthService } from '../users-and-auth/auth/auth.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { UsersService } from '../users-and-auth/users/users.service';
export function createOidcTestServices(dataSource: DataSource) {
  // ── 3. Build real services backed by SQLite ───────────────────────────────
  const userRepo = dataSource.getRepository(User);
  const authDetailRepo = dataSource.getRepository(AuthenticationDetail);
  const sessionRepo = dataSource.getRepository(Session);
  const resourceUsageRepo = dataSource.getRepository(ResourceUsage);
  const userRoleRepo = dataSource.getRepository(UserRole);
  const roleRepo = dataSource.getRepository(Role);
  const permissionRepo = dataSource.getRepository(Permission);

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
  const rbacService = new RbacService(userRoleRepo, roleRepo, permissionRepo);
  const usersService = new UsersService(
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
  const authService = new AuthService(
    mockEmailService,
    authDetailRepo,
    usersService,
    tokenHashService,
    mockMetricsService,
  );

  const mockModuleRef = {
    get: (token: unknown): unknown => {
      if (token === UsersService) return usersService;
      if (token === AuthService) return authService;
      if (token === RbacService) return rbacService;
      if (token === MetricsService) return mockMetricsService;
      return null;
    },
  } as unknown as ModuleRef;

  return { userRepo, rbacService, usersService, authService, mockModuleRef };
}

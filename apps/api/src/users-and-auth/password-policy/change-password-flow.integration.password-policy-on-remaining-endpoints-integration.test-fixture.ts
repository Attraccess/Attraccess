import {
  AuthenticationDetail,
  AuthenticationType,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  Setting,
} from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { AuthService } from '../auth/auth.service';
import { SSOService } from '../auth/sso/sso.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { RbacService } from '../rbac/rbac.service';
import { SignupDomainService } from '../users/signup-domain.service';
import { UserPasswordService } from '../users/user-password.service';
import { UserRegistrationService } from '../users/user-registration.service';
import { UsersService } from '../users/users.service';
import { HibpClient } from './hibp.client';
import { PasswordPolicyService } from './password-policy.service';
import { ZxcvbnService } from './zxcvbn.service';

const STRONG_PASSWORD = 'Tr0ub4dor-Hummingbird-9!plate';

const ANOTHER_STRONG_PASSWORD = 'Diff3rent-Hummingbird-9!plate';

const WEAK_PASSWORD = 'password';

const buildPolicyRow = (overrides: Partial<PasswordPolicy> = {}): PasswordPolicy => ({
  id: 1,
  minLength: 12,
  maxLength: 128,
  allowAllUnicode: true,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecial: false,
  checkHIBP: true,
  checkCommonPasswords: true,
  minZxcvbnScore: 3,
  historySize: 0,
  rotationDays: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 1,
  ...overrides,
});

interface BuildOpts {
  policy?: Partial<PasswordPolicy>;
  zxcvbnScore?: number;
  hibpPwned?: boolean;
  currentPasswordHash?: string | null;
  history?: Array<{ id: number; passwordHash: string; userId: number; createdAt: Date }>;
  userId?: number;
  user?: { id: number; username: string; email: string; passwordResetToken?: string | null };
  isSSOUser?: boolean;
}

async function buildController(opts: BuildOpts = {}) {
  const userId = opts.userId ?? 42;
  const user = opts.user ?? {
    id: userId,
    username: 'jane',
    email: 'jane@example.com',
    passwordResetToken: 'hashed:reset-token-123',
  };

  const usersFindOne = jest.fn(async () => user);
  const usersUpdateOne = jest.fn(async () => undefined);
  const changePassword = jest.fn(async () => undefined);
  const addAuthenticationDetails = jest.fn(async () => ({ id: 1, password: 'hashed-new' }));
  const verifyEmail = jest.fn(async () => undefined);
  const sendVerificationEmail = jest.fn(async () => undefined);
  const isSSOUser = jest.fn(async () => Boolean(opts.isSSOUser));
  const deleteBuilder = {
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => ({ affected: 0 })),
  };
  const historyRepo = {
    find: jest.fn(async () => opts.history ?? []),
    save: jest.fn(async (row) => row),
    create: jest.fn((row) => row),
    createQueryBuilder: jest.fn(() => deleteBuilder),
  };
  const authDetailRepo = {
    findOne: jest.fn(async () =>
      opts.currentPasswordHash === undefined
        ? null
        : { password: opts.currentPasswordHash, type: AuthenticationType.LOCAL_PASSWORD },
    ),
  };
  const policyRepo = {
    findOne: jest.fn(async () => buildPolicyRow(opts.policy ?? {})),
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => row),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      UserPasswordService,
      UserRegistrationService,
      SignupDomainService,
      PasswordPolicyService,
      {
        provide: HibpClient,
        useValue: {
          check: jest.fn(async () => ({ pwned: !!opts.hibpPwned, count: opts.hibpPwned ? 5 : 0, available: true })),
        },
      },
      {
        provide: ZxcvbnService,
        useValue: {
          evaluate: jest.fn(() => ({
            score: opts.zxcvbnScore ?? 4,
            guessesLog10: 12,
            crackTimesSeconds: {},
            warning: '',
            suggestions: [],
          })),
        },
      },
      { provide: getRepositoryToken(PasswordPolicy), useValue: policyRepo },
      {
        provide: getRepositoryToken(PasswordPolicyOverride),
        useValue: {
          find: jest.fn(async () => []),
          findOne: jest.fn(async () => null),
          save: jest.fn(async (row) => row),
          create: jest.fn((row) => row),
          merge: jest.fn((a, b) => Object.assign(a, b)),
          delete: jest.fn(async () => ({ affected: 0 })),
          remove: jest.fn(async (row) => row),
        },
      },
      {
        provide: DataSource,
        useValue: {
          transaction: jest.fn(async (cb: never) =>
            (cb as unknown as (m: { getRepository: () => unknown }) => Promise<unknown>)({
              getRepository: () => ({
                findOne: jest.fn(),
                find: jest.fn(async () => []),
                save: jest.fn(),
                create: jest.fn(),
                remove: jest.fn(),
              }),
            }),
          ),
        },
      },
      { provide: getRepositoryToken(PasswordHistory), useValue: historyRepo },
      { provide: getRepositoryToken(AuthenticationDetail), useValue: authDetailRepo },
      {
        provide: UsersService,
        useValue: {
          findOne: usersFindOne,
          updateOne: usersUpdateOne,
          isSSOUser,
          findMany: jest.fn(async () => ({ data: [], total: 0 })),
          countUsers: jest.fn(async () => 1),
          deleteOne: jest.fn(),
          cleanupUsername: (v: string) => v,
          validateUsernameOrThrow: jest.fn(),
        },
      },
      {
        provide: AuthService,
        useValue: {
          changePassword,
          addAuthenticationDetails,
          verifyEmail,
          removeAuthenticationDetails: jest.fn(),
          generateEmailVerificationToken: jest.fn(async () => 'token'),
        },
      },
      {
        provide: EmailService,
        useValue: { sendVerificationEmail, sendPasswordResetEmail: jest.fn(), sendPasswordChangedEmail: jest.fn() },
      },
      { provide: SSOService, useValue: { getProviderByTypeAndIdWithConfiguration: jest.fn() } },
      {
        provide: TokenHashService,
        useValue: { hashToken: (t: string) => `hashed:${t}` },
      },
      {
        provide: getRepositoryToken(Setting),
        useValue: { findOne: jest.fn(async () => null), insert: jest.fn(), update: jest.fn() },
      },
      {
        provide: BruteForceProtectionService,
        useValue: {
          assertIpAllowed: jest.fn().mockResolvedValue(undefined),
          assertAccountAllowed: jest.fn().mockResolvedValue(undefined),
          recordFailure: jest.fn().mockResolvedValue(undefined),
          recordSuccess: jest.fn().mockResolvedValue(undefined),
        },
      },
      { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
      { provide: RbacService, useValue: { getEffectivePermissions: jest.fn(async () => new Set<string>()) } },
    ],
  }).compile();

  const passwordService = module.get(UserPasswordService);
  const registrationService = module.get(UserRegistrationService);
  return {
    passwordService,
    registrationService,
    changePassword,
    addAuthenticationDetails,
    usersUpdateOne,
    historyRepo,
    authDetailRepo,
    user,
    verifyEmail,
  };
}
export function registerPasswordPolicyOnRemainingEndpointsIntegrationFixture() {
  return {
    get STRONG_PASSWORD() {
      return STRONG_PASSWORD;
    },
    get ANOTHER_STRONG_PASSWORD() {
      return ANOTHER_STRONG_PASSWORD;
    },
    get WEAK_PASSWORD() {
      return WEAK_PASSWORD;
    },
    get buildController() {
      return buildController;
    },
  };
}

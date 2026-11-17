import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { Setting } from '@attraccess/database-entities';
import type { PasswordPolicyValues } from '@attraccess/application-models';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UNIT_OF_WORK } from '../../database/unit-of-work';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { AuthService } from '../auth/auth.service';
import { CREDENTIAL_STORE } from '../auth/credentials/credential-store.port';
import { SSOService } from '../auth/sso/sso.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { RbacService } from '../rbac/rbac.service';
import { SignupDomainService } from '../users/signup-domain.service';
import { UserPasswordService } from '../users/user-password.service';
import { UserRegistrationService } from '../users/user-registration.service';
import { UsersService } from '../users/users.service';
import { HibpClient } from './hibp.client';
import { PASSWORD_POLICY_STORE } from './password-policy-store.port';
import { PasswordPolicyService } from './password-policy.service';
import { ZxcvbnService } from './zxcvbn.service';

const STRONG_PASSWORD = 'Tr0ub4dor-Hummingbird-9!plate';

const ANOTHER_STRONG_PASSWORD = 'Diff3rent-Hummingbird-9!plate';

const WEAK_PASSWORD = 'password';

const buildPolicyRow = (overrides: Partial<PasswordPolicyValues> = {}): PasswordPolicyValues => ({
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
  ...overrides,
});

interface BuildOpts {
  policy?: Partial<PasswordPolicyValues>;
  zxcvbnScore?: number;
  hibpPwned?: boolean;
  currentPasswordHash?: string | null;
  history?: Array<{ id: number; passwordHash: string; userId: number; createdAt: Date }>;
  userId?: number;
  user?: {
    id: number;
    username: string;
    email: string;
    passwordResetToken?: string | null;
    passwordResetTokenExpiresAt?: Date | null;
  };
  isSSOUser?: boolean;
}

async function buildController(opts: BuildOpts = {}) {
  const userId = opts.userId ?? 42;
  const user = opts.user ?? {
    id: userId,
    username: 'jane',
    email: 'jane@example.com',
    passwordResetToken: 'hashed:reset-token-123',
    passwordResetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };

  const usersFindOne = jest.fn(async () => user);
  const usersUpdateOne = jest.fn(async () => undefined);
  const changePassword = jest.fn(async () => undefined);
  const addAuthenticationDetails = jest.fn(async () => ({ id: 1, password: 'hashed-new' }));
  const verifyEmail = jest.fn(async () => undefined);
  const sendVerificationEmail = jest.fn(async () => undefined);
  const isSSOUser = jest.fn(async () => Boolean(opts.isSSOUser));
  const policyStore = {
    findPolicy: jest.fn(async () => buildPolicyRow(opts.policy ?? {})),
    seedPolicy: jest.fn(),
    savePolicy: jest.fn(),
    listOverrides: jest.fn(async () => []),
    findOverride: jest.fn(async () => null),
    saveOverride: jest.fn(),
    deleteOverride: jest.fn(),
    recentHistoryHashes: jest.fn(async () => (opts.history ?? []).map((entry) => entry.passwordHash)),
    recordHistory: jest.fn(),
  };
  const credentialStore = {
    findLocalPasswordHash: jest.fn(async () =>
      opts.currentPasswordHash === undefined ? null : opts.currentPasswordHash,
    ),
  };
  const unitOfWork = {
    current: () => undefined,
    run: async <T>(work: (scope: unknown) => Promise<T>) => work({ isOpen: true, afterCommit: jest.fn() }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      { provide: AUDIT_RECORDER, useValue: { record: jest.fn() } },
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
      { provide: PASSWORD_POLICY_STORE, useValue: policyStore },
      { provide: CREDENTIAL_STORE, useValue: credentialStore },
      { provide: UNIT_OF_WORK, useValue: unitOfWork },
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
    policyStore,
    credentialStore,
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

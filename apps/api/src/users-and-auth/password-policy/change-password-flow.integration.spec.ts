import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {
  AuthenticationDetail,
  AuthenticationType,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyAudit,
  PasswordPolicyOverride,
  Setting,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { UserPasswordService } from '../users/user-password.service';
import { UserRegistrationService } from '../users/user-registration.service';
import { SignupDomainService } from '../users/signup-domain.service';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { SSOService } from '../auth/sso/sso.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { PasswordPolicyService } from './password-policy.service';
import { HibpClient } from './hibp.client';
import { ZxcvbnService } from './zxcvbn.service';
import { RbacService } from '../rbac/rbac.service';
import { PasswordPolicyViolationException } from './password-policy.errors';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';

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
      { provide: HibpClient, useValue: { check: jest.fn(async () => ({ pwned: !!opts.hibpPwned, count: opts.hibpPwned ? 5 : 0, available: true })) } },
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
        provide: getRepositoryToken(PasswordPolicyAudit),
        useValue: { create: jest.fn((row) => row), save: jest.fn(async (row) => row) },
      },
      {
        provide: DataSource,
        useValue: {
          transaction: jest.fn(async (cb: never) =>
            (cb as unknown as (m: { getRepository: () => unknown }) => Promise<unknown>)({
              getRepository: () => ({ findOne: jest.fn(), find: jest.fn(async () => []), save: jest.fn(), create: jest.fn(), remove: jest.fn() }),
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

describe('Password policy on remaining endpoints (integration)', () => {
  describe('POST /users/:id/password (setUserPassword)', () => {
    it('rejects a weak password with structured policy errors', async () => {
      const { passwordService, changePassword } = await buildController({ zxcvbnScore: 0 });
      await expect(
        passwordService.setUserPassword(
          42,
          { password: WEAK_PASSWORD },
          { id: 42 } as never,
        ),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('accepts a strong password and changes it', async () => {
      const { passwordService, changePassword } = await buildController({ zxcvbnScore: 4 });
      await passwordService.setUserPassword(
        42,
        { password: STRONG_PASSWORD },
        { id: 42 } as never,
      );
      expect(changePassword).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), STRONG_PASSWORD);
    });

    it('blocks reuse when historySize > 0 and password matches current hash', async () => {
      const currentHash = await bcrypt.hash(STRONG_PASSWORD, 4);
      const { passwordService, changePassword } = await buildController({
        policy: { historySize: 3 },
        zxcvbnScore: 4,
        currentPasswordHash: currentHash,
      });
      await expect(
        passwordService.setUserPassword(
          42,
          { password: STRONG_PASSWORD },
          { id: 42 } as never,
        ),
      ).rejects.toMatchObject({
        policyErrors: expect.arrayContaining([{ code: 'PASSWORD_REUSED', params: { historySize: 3 } }]),
      });
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('archives current hash to history before changing when historySize > 0', async () => {
      const currentHash = await bcrypt.hash('Previous-Tr0ub4dor-9!Hum', 4);
      const { passwordService, historyRepo, changePassword } = await buildController({
        policy: { historySize: 2 },
        zxcvbnScore: 4,
        currentPasswordHash: currentHash,
      });
      await passwordService.setUserPassword(
        42,
        { password: STRONG_PASSWORD },
        { id: 42 } as never,
      );
      expect(historyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, passwordHash: currentHash }),
      );
      expect(changePassword).toHaveBeenCalled();
    });
  });

  describe('POST /users/:userId/change-password-by-token', () => {
    it('rejects a weak password and does not change it', async () => {
      const { passwordService, changePassword } = await buildController({ zxcvbnScore: 0 });
      await expect(
        passwordService.changePasswordViaResetToken(42, { password: WEAK_PASSWORD, token: 'reset-token-123' }),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('accepts a strong password and clears the reset token', async () => {
      const { passwordService, changePassword, usersUpdateOne } = await buildController({ zxcvbnScore: 4 });
      await passwordService.changePasswordViaResetToken(42, { password: STRONG_PASSWORD, token: 'reset-token-123' });
      expect(changePassword).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), STRONG_PASSWORD);
      expect(usersUpdateOne).toHaveBeenCalledWith(42, expect.objectContaining({ passwordResetToken: null }));
    });

    it('blocks reuse when candidate matches a prior history entry', async () => {
      const priorHash = await bcrypt.hash(ANOTHER_STRONG_PASSWORD, 4);
      const { passwordService, changePassword } = await buildController({
        policy: { historySize: 5 },
        zxcvbnScore: 4,
        currentPasswordHash: null,
        history: [{ id: 1, passwordHash: priorHash, userId: 42, createdAt: new Date() }],
      });
      await expect(
        passwordService.changePasswordViaResetToken(42, { password: ANOTHER_STRONG_PASSWORD, token: 'reset-token-123' }),
      ).rejects.toMatchObject({
        policyErrors: expect.arrayContaining([{ code: 'PASSWORD_REUSED', params: { historySize: 5 } }]),
      });
      expect(changePassword).not.toHaveBeenCalled();
    });
  });

  describe('POST /users/accept-invitation', () => {
    it('rejects a weak password and never adds auth details', async () => {
      const { registrationService, addAuthenticationDetails, verifyEmail } = await buildController({ zxcvbnScore: 0 });
      await expect(
        registrationService.acceptInvitation({ token: 'inv-token-123', email: 'jane@example.com', password: WEAK_PASSWORD }),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);
      expect(addAuthenticationDetails).not.toHaveBeenCalled();
      expect(verifyEmail).toHaveBeenCalled();
    });

    it('accepts a strong password and adds local auth details', async () => {
      const { registrationService, addAuthenticationDetails } = await buildController({ zxcvbnScore: 4 });
      const result = await registrationService.acceptInvitation({
        token: 'inv-token-123',
        email: 'jane@example.com',
        password: STRONG_PASSWORD,
      });
      expect(result).toEqual(expect.objectContaining({ id: 42, username: 'jane' }));
      expect(addAuthenticationDetails).toHaveBeenCalledWith(42, expect.objectContaining({ type: AuthenticationType.LOCAL_PASSWORD }));
    });
  });

  describe('logging hygiene', () => {
    it('never logs the raw password on weak rejection', async () => {
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const { passwordService } = await buildController({ zxcvbnScore: 0 });
      await expect(
        passwordService.setUserPassword(
          42,
          { password: 'SuperSecretLeakable123!' },
          { id: 42 } as never,
        ),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);

      for (const spy of [debugSpy, logSpy, warnSpy, errorSpy]) {
        for (const call of spy.mock.calls) {
          for (const arg of call) {
            if (typeof arg === 'string') {
              expect(arg).not.toContain('SuperSecretLeakable123!');
            }
          }
        }
      }

      debugSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});

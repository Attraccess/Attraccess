import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AuthenticationDetail,
  AuthenticationType,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  Setting,
} from '@attraccess/database-entities';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { SSOService } from '../auth/sso/sso.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { PasswordPolicyService } from './password-policy.service';
import { HibpClient } from './hibp.client';
import { ZxcvbnService } from './zxcvbn.service';
import { PasswordPolicyViolationException } from './password-policy.errors';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';

const policyRow = (overrides: Partial<PasswordPolicy> = {}): PasswordPolicy => ({
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
  ...overrides,
});

describe('Register flow + password policy (integration)', () => {
  let controller: UsersController;
  let createOne: jest.Mock;
  let addAuthenticationDetails: jest.Mock;
  let generateEmailVerificationToken: jest.Mock;
  let sendVerificationEmail: jest.Mock;
  let hibpCheck: jest.Mock;
  let zxcvbnScore = 4;

  beforeEach(async () => {
    createOne = jest.fn(async ({ username, email }) => ({ id: 1, username, email }));
    addAuthenticationDetails = jest.fn(async () => ({ id: 'auth-1' }));
    generateEmailVerificationToken = jest.fn(async () => 'token');
    sendVerificationEmail = jest.fn(async () => undefined);
    hibpCheck = jest.fn(async () => ({ pwned: false, count: 0, available: true }));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        PasswordPolicyService,
        { provide: HibpClient, useValue: { check: hibpCheck } },
        {
          provide: ZxcvbnService,
          useValue: {
            evaluate: () => ({
              score: zxcvbnScore,
              guessesLog10: 12,
              crackTimesSeconds: {},
              warning: '',
              suggestions: [],
            }),
          },
        },
        { provide: getRepositoryToken(PasswordPolicy), useValue: { findOne: jest.fn(async () => policyRow()), create: jest.fn((row) => row), save: jest.fn() } },
        { provide: getRepositoryToken(PasswordHistory), useValue: { find: jest.fn(async () => []), save: jest.fn(), create: jest.fn((row) => row), createQueryBuilder: jest.fn(() => ({ delete: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), execute: jest.fn(async () => ({ affected: 0 })) })) } },
        { provide: getRepositoryToken(PasswordPolicyOverride), useValue: { find: jest.fn(async () => []), findOne: jest.fn(async () => null), save: jest.fn(), create: jest.fn((row) => row), merge: jest.fn((a, b) => Object.assign(a, b)), delete: jest.fn() } },
        { provide: getRepositoryToken(AuthenticationDetail), useValue: { findOne: jest.fn(async () => null) } },
        {
          provide: UsersService,
          useValue: {
            createOne,
            findMany: jest.fn(async () => ({ data: [], total: 0 })),
            findOne: jest.fn(),
            deleteOne: jest.fn(),
            updateOne: jest.fn(),
            countUsers: jest.fn(async () => 0),
            cleanupUsername: (v: string) => v,
            validateUsernameOrThrow: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            addAuthenticationDetails,
            generateEmailVerificationToken,
            removeAuthenticationDetails: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: { sendVerificationEmail },
        },
        {
          provide: SSOService,
          useValue: { getProviderByTypeAndIdWithConfiguration: jest.fn() },
        },
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
      ],
    }).compile();
    controller = module.get(UsersController);
  });

  it('rejects a weak password with structured policy errors', async () => {
    zxcvbnScore = 1;
    await expect(
      controller.createOne({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(PasswordPolicyViolationException);
    expect(createOne).not.toHaveBeenCalled();
  });

  it('accepts a strong password and creates the user', async () => {
    zxcvbnScore = 4;
    const result = await controller.createOne({
      username: 'newuser2',
      email: 'newuser2@example.com',
      password: 'Tr0ub4dor-Hummingbird-9!plate',
      strategy: AuthenticationType.LOCAL_PASSWORD,
    });
    expect(result).toEqual(expect.objectContaining({ id: 1, username: 'newuser2' }));
    expect(createOne).toHaveBeenCalled();
    expect(addAuthenticationDetails).toHaveBeenCalled();
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it('rejects when HIBP marks password as pwned', async () => {
    zxcvbnScore = 4;
    hibpCheck = jest.fn(async () => ({ pwned: true, count: 7, available: true }));
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        PasswordPolicyService,
        { provide: HibpClient, useValue: { check: hibpCheck } },
        {
          provide: ZxcvbnService,
          useValue: {
            evaluate: () => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] }),
          },
        },
        { provide: getRepositoryToken(PasswordPolicy), useValue: { findOne: jest.fn(async () => policyRow()), create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(PasswordHistory), useValue: { find: jest.fn(async () => []), save: jest.fn(), create: jest.fn((row) => row), createQueryBuilder: jest.fn(() => ({ delete: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), execute: jest.fn(async () => ({ affected: 0 })) })) } },
        { provide: getRepositoryToken(PasswordPolicyOverride), useValue: { find: jest.fn(async () => []), findOne: jest.fn(async () => null), save: jest.fn(), create: jest.fn((row) => row), merge: jest.fn((a, b) => Object.assign(a, b)), delete: jest.fn() } },
        { provide: getRepositoryToken(AuthenticationDetail), useValue: { findOne: jest.fn(async () => null) } },
        {
          provide: UsersService,
          useValue: {
            createOne: jest.fn(),
            findMany: jest.fn(async () => ({ data: [], total: 0 })),
            findOne: jest.fn(),
            deleteOne: jest.fn(),
            updateOne: jest.fn(),
            countUsers: jest.fn(async () => 0),
            cleanupUsername: (v: string) => v,
            validateUsernameOrThrow: jest.fn(),
          },
        },
        { provide: AuthService, useValue: { addAuthenticationDetails: jest.fn(), generateEmailVerificationToken: jest.fn(), removeAuthenticationDetails: jest.fn() } },
        { provide: EmailService, useValue: { sendVerificationEmail: jest.fn() } },
        { provide: SSOService, useValue: { getProviderByTypeAndIdWithConfiguration: jest.fn() } },
        { provide: TokenHashService, useValue: { hashToken: (t: string) => `hashed:${t}` } },
        { provide: getRepositoryToken(Setting), useValue: { findOne: jest.fn(async () => null) } },
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
      ],
    }).compile();
    const ctrl = moduleRef.get(UsersController);

    await expect(
      ctrl.createOne({
        username: 'pwned-user',
        email: 'pwned@example.com',
        password: 'Tr0ub4dor-Hummingbird-9!plate',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      }),
    ).rejects.toMatchObject({ policyErrors: expect.arrayContaining([{ code: 'HIBP_PWNED', params: { count: 7 } }]) });
  });
});

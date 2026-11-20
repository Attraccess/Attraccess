import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { Test, TestingModule } from '@nestjs/testing';
import { SETTINGS_ROWS } from '../../settings/settings-rows.port';
import { AuthenticationType, type PasswordPolicyValues } from '@attraccess/application-models';
import { UNIT_OF_WORK } from '../../database/unit-of-work';
import { CREDENTIAL_STORE } from '../auth/credentials/credential-store.port';
import { PASSWORD_POLICY_STORE } from './password-policy-store.port';
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

const policyRow = (overrides: Partial<PasswordPolicyValues> = {}): PasswordPolicyValues => ({
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

/** The persistence behind the password policy, as fakes: the default policy, no history, no local password. */
const policyPersistenceProviders = () => [
  {
    provide: PASSWORD_POLICY_STORE,
    useValue: {
      findPolicy: jest.fn(async () => policyRow()),
      seedPolicy: jest.fn(),
      savePolicy: jest.fn(),
      listOverrides: jest.fn(async () => []),
      findOverride: jest.fn(async () => null),
      saveOverride: jest.fn(),
      deleteOverride: jest.fn(),
      recentHistoryHashes: jest.fn(async () => []),
      recordHistory: jest.fn(),
    },
  },
  { provide: CREDENTIAL_STORE, useValue: { findLocalPasswordHash: jest.fn(async () => null) } },
  {
    provide: UNIT_OF_WORK,
    useValue: {
      current: () => undefined,
      run: async (work: (scope: unknown) => Promise<unknown>) => work({ isOpen: true, afterCommit: jest.fn() }),
    },
  },
];

describe('Register flow + password policy (integration)', () => {
  let service: UserRegistrationService;
  let createOne: jest.Mock;
  let addAuthenticationDetails: jest.Mock;
  let hashPassword: jest.Mock;
  let generateEmailVerificationToken: jest.Mock;
  let sendVerificationEmail: jest.Mock;
  let hibpCheck: jest.Mock;
  let zxcvbnScore = 4;

  beforeEach(async () => {
    createOne = jest.fn(async ({ username, email }) => ({ id: 1, username, email }));
    addAuthenticationDetails = jest.fn(async () => ({ id: 'auth-1' }));
    hashPassword = jest.fn(async (password) => `hashed-${password}`);
    generateEmailVerificationToken = jest.fn(async () => 'token');
    sendVerificationEmail = jest.fn(async () => undefined);
    hibpCheck = jest.fn(async () => ({ pwned: false, count: 0, available: true }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AUDIT_RECORDER, useValue: { record: jest.fn() } },
        UserRegistrationService,
        SignupDomainService,
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
        ...policyPersistenceProviders(),
        {
          provide: UsersService,
          useValue: {
            createOne,
            findMany: jest.fn(async () => ({ data: [], total: 0 })),
            findOne: jest.fn(),
            deleteOne: jest.fn(),
            updateOne: jest.fn(),
            withTransaction: jest.fn(async (handler) => handler({})),
            recordCreatedUser: jest.fn(),
            countUsers: jest.fn(async () => 0),
            cleanupUsername: (v: string) => v,
            validateUsernameOrThrow: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            addAuthenticationDetails,
            hashPassword,
            generateEmailVerificationToken,
            removeAuthenticationDetails: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: { assertSmtpConfigured: jest.fn(), sendVerificationEmail },
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
          provide: SETTINGS_ROWS,
          useValue: { findValue: jest.fn(async () => null), upsertValue: jest.fn(), remove: jest.fn() },
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
    service = module.get(UserRegistrationService);
  });

  it('rejects a weak password with structured policy errors', async () => {
    zxcvbnScore = 1;
    await expect(
      service.createOne({
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
    const result = await service.createOne({
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
      providers: [
        { provide: AUDIT_RECORDER, useValue: { record: jest.fn() } },
        UserRegistrationService,
        SignupDomainService,
        PasswordPolicyService,
        { provide: HibpClient, useValue: { check: hibpCheck } },
        {
          provide: ZxcvbnService,
          useValue: {
            evaluate: () => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] }),
          },
        },
        ...policyPersistenceProviders(),
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
        {
          provide: AuthService,
          useValue: {
            addAuthenticationDetails: jest.fn(),
            generateEmailVerificationToken: jest.fn(),
            removeAuthenticationDetails: jest.fn(),
          },
        },
        { provide: EmailService, useValue: { sendVerificationEmail: jest.fn() } },
        { provide: SSOService, useValue: { getProviderByTypeAndIdWithConfiguration: jest.fn() } },
        { provide: TokenHashService, useValue: { hashToken: (t: string) => `hashed:${t}` } },
        {
          provide: SETTINGS_ROWS,
          useValue: { findValue: jest.fn(async () => null), upsertValue: jest.fn(), remove: jest.fn() },
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
    const ctrl = moduleRef.get(UserRegistrationService);

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

import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { CREDENTIAL_STORE, type CredentialStore } from './credentials/credential-store.port';
import { SSOService } from './sso/sso.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

const mockMetricsService = {
  authLoginTotal: { inc: jest.fn() },
};

export type MockedCredentialStore = { [Method in keyof CredentialStore]: jest.Mock };

export function registerAuthServiceFixture() {
  let authService: AuthService;

  let credentials: MockedCredentialStore;

  let usersService: UsersService;

  let emailService: { sendVerificationEmail: jest.Mock; sendPasswordChangedEmail: jest.Mock };

  let passwordPolicy: { getPolicy: jest.Mock };

  beforeEach(async () => {
    credentials = {
      findUserIdBySso: jest.fn(),
      findSso: jest.fn(),
      updateSsoSubject: jest.fn(),
      findLocalPasswordHash: jest.fn(),
      add: jest.fn(async (userId, credential) => ({ id: 1, userId, type: credential.type })),
      replaceLocalPassword: jest.fn(),
      removeLocalPassword: jest.fn(),
      remove: jest.fn(),
    };
    emailService = { sendVerificationEmail: jest.fn(), sendPasswordChangedEmail: jest.fn() };
    passwordPolicy = { getPolicy: jest.fn().mockResolvedValue({ historySize: 0 }) };
    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findByLoginIdentifier: jest.fn(),
            updateOne: jest.fn(),
            isSSOUser: jest.fn().mockResolvedValue(false),
          },
        },
        { provide: CREDENTIAL_STORE, useValue: credentials },
        { provide: EmailService, useValue: emailService },
        {
          provide: SSOService,
          useValue: {
            getProviderById: jest.fn(),
          },
        },
        {
          provide: TokenHashService,
          useValue: {
            hashToken: jest.fn((token: string) => `hashed:${token}`),
          },
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        { provide: PasswordPolicyService, useValue: passwordPolicy },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });
  return {
    get mockMetricsService() {
      return mockMetricsService;
    },
    get authService() {
      return authService;
    },
    get credentials() {
      return credentials;
    },
    get usersService() {
      return usersService;
    },
    get emailService() {
      return emailService;
    },
    get passwordPolicy() {
      return passwordPolicy;
    },
  };
}

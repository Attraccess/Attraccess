import { AuthenticationPersistence } from './persistence/port';
import { AuthenticationDetail } from '@attraccess/application-models';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../../email/email.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { SSOService } from './sso/sso.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

const mockMetricsService = {
  authLoginTotal: { inc: jest.fn() },
};

export function registerAuthServiceFixture() {
  let authService: AuthService;

  let persistence: jest.Mocked<AuthenticationPersistence>;

  let usersService: UsersService;

  beforeEach(async () => {
    persistence = {
      ssoIdentity: jest.fn(),
      ssoCount: jest.fn(),
      detail: jest.fn(),
      updateSubject: jest.fn(),
      removeDetail: jest.fn(),
      saveAuthentication: jest.fn(async (value) => value as AuthenticationDetail),
    };
    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        AuthService,
        { provide: AuthenticationPersistence, useValue: persistence },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findByLoginIdentifier: jest.fn(),
            updateOne: jest.fn(),
            isSSOUser: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
          },
        },
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
    get persistence() {
      return persistence;
    },
    get usersService() {
      return usersService;
    },
  };
}

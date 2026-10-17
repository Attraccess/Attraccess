import { AuthenticationDetail } from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

const AuthenticationDetailRepository = getRepositoryToken(AuthenticationDetail);
export function registerAuthServiceFixture() {
  let authService: AuthService;

  let authenticationDetailRepository: Repository<AuthenticationDetail>;

  let usersService: UsersService;

  beforeEach(async () => {
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
        {
          provide: AuthenticationDetailRepository,
          useValue: {
            findOne: jest.fn(),
            count: jest.fn(),
            save: jest.fn(async (value) => value),
            update: jest.fn(),
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
    authenticationDetailRepository = module.get<typeof authenticationDetailRepository>(AuthenticationDetailRepository);
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
    get authenticationDetailRepository() {
      return authenticationDetailRepository;
    },
    get usersService() {
      return usersService;
    },
  };
}

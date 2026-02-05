import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthenticationDetail, AuthenticationType, User } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { SSOService } from './sso/sso.service';
import * as bcrypt from 'bcrypt';
import { TokenHashService } from '../../encryption/token-hash.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

const AuthenticationDetailRepository = getRepositoryToken(AuthenticationDetail);

describe('AuthService', () => {
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
            updateOne: jest.fn(),
            isSSOUser: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: AuthenticationDetailRepository,
          useValue: {
            findOne: jest.fn(),
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
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    authenticationDetailRepository = module.get<typeof authenticationDetailRepository>(AuthenticationDetailRepository);
    usersService = module.get<UsersService>(UsersService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  it('should authenticate user with correct credentials', async () => {
    const user = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
      systemPermissions: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      resourceIntroductions: [],
      resourceUsages: [],
      authenticationDetails: [],
      resourceIntroducerPermissions: [],
    } as User;
    jest.spyOn(usersService, 'findOne').mockResolvedValue(user);

    const authenticationDetail: Partial<AuthenticationDetail> = {
      userId: 1,
      type: AuthenticationType.LOCAL_PASSWORD,
      password: 'hashed-password',
    };
    jest
      .spyOn(authenticationDetailRepository, 'findOne')
      .mockResolvedValue(authenticationDetail as AuthenticationDetail);

    // Mock bcrypt.compare to return true for correct password
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const isAuthenticated = await authService.getUserByUsernameAndAuthenticationDetails('testuser', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'correct-password' },
    });

    expect(isAuthenticated).not.toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed-password');
  });

  it('should not authenticate user with incorrect credentials', async () => {
    const user = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
      systemPermissions: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      resourceIntroductions: [],
      resourceUsages: [],
      authenticationDetails: [],
      resourceIntroducerPermissions: [],
    } as User;
    jest.spyOn(usersService, 'findOne').mockResolvedValue(user);

    jest.spyOn(authenticationDetailRepository, 'findOne').mockResolvedValue({
      id: 1,
      userId: user.id,
      type: AuthenticationType.LOCAL_PASSWORD,
      password: 'hashed-password',
    } as AuthenticationDetail);

    // Mock bcrypt.compare to return false for incorrect password
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const isAuthenticated = await authService.getUserByUsernameAndAuthenticationDetails('testuser', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'wrong-password' },
    });

    expect(isAuthenticated).toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledWith('wrong-password', 'hashed-password');
  });

  it('should not authenticate a non-existent user', async () => {
    jest.spyOn(usersService, 'findOne').mockResolvedValue(null);

    const isAuthenticated = await authService.getUserByUsernameAndAuthenticationDetails('nonexistentuser', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'password' },
    });

    expect(isAuthenticated).toBeNull();
  });
});

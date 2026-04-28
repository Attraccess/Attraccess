import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthenticationDetail, AuthenticationType, SSOProviderType, User } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, UpdateResult } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { SSOService } from './sso/sso.service';
import * as bcrypt from 'bcrypt';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RateLimitService } from '../../rate-limit/rate-limit.service';

const mockMetricsService = {
  authLoginTotal: { inc: jest.fn() },
};

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

const AuthenticationDetailRepository = getRepositoryToken(AuthenticationDetail);

describe('AuthService', () => {
  let authService: AuthService;
  let authenticationDetailRepository: Repository<AuthenticationDetail>;
  let usersService: UsersService;
  let rateLimitService: { checkLoginLock: jest.Mock; applyLoginFailure: jest.Mock; applyLoginSuccess: jest.Mock };
  let userRepository: { update: jest.Mock };

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
            count: jest.fn(),
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
        {
          provide: RateLimitService,
          useValue: {
            checkLoginLock: jest.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
            applyLoginFailure: jest.fn().mockResolvedValue({ failedLoginCount: 1, loginLockedUntil: null }),
            applyLoginSuccess: jest.fn().mockReturnValue({ failedLoginCount: 0, loginLockedUntil: null }),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    authenticationDetailRepository = module.get<typeof authenticationDetailRepository>(AuthenticationDetailRepository);
    usersService = module.get<UsersService>(UsersService);
    rateLimitService = module.get(RateLimitService) as unknown as typeof rateLimitService;
    userRepository = module.get(getRepositoryToken(User)) as unknown as typeof userRepository;

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

  describe('findSSOAuthenticationDetail', () => {
    it('returns the SSO detail when one exists for the user', async () => {
      const ssoDetail = {
        id: 5,
        userId: 1,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 10,
        ssoSubject: 'sub-abc',
      } as AuthenticationDetail;

      jest.spyOn(authenticationDetailRepository, 'findOne').mockResolvedValue(ssoDetail);

      const result = await authService.findSSOAuthenticationDetail(1);

      expect(result).toEqual(ssoDetail);
      expect(authenticationDetailRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 1, type: AuthenticationType.SSO },
      });
    });

    it('returns null when no SSO detail exists for the user', async () => {
      jest.spyOn(authenticationDetailRepository, 'findOne').mockResolvedValue(null);

      const result = await authService.findSSOAuthenticationDetail(99);

      expect(result).toBeNull();
    });
  });

  describe('updateSSOSubject', () => {
    it('updates the ssoSubject on the given detail row', async () => {
      jest.spyOn(authenticationDetailRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      await authService.updateSSOSubject(5, 'new-sub-xyz');

      expect(authenticationDetailRepository.update).toHaveBeenCalledWith(5, { ssoSubject: 'new-sub-xyz' });
    });
  });

  describe('userHasSSOAuthentication', () => {
    it('returns true when user has an SSO authentication detail', async () => {
      (authenticationDetailRepository.count as jest.Mock).mockResolvedValue(1);

      const result = await authService.userHasSSOAuthentication(1);

      expect(result).toBe(true);
    });

    it('returns false when user has no SSO authentication detail', async () => {
      (authenticationDetailRepository.count as jest.Mock).mockResolvedValue(0);

      const result = await authService.userHasSSOAuthentication(1);

      expect(result).toBe(false);
    });
  });

  describe('login lockout (LOCAL_PASSWORD)', () => {
    const buildUser = (overrides: Partial<User> = {}) =>
      ({
        id: 1,
        username: 'lockuser',
        email: 'lock@example.com',
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
        lastVerificationEmailSentAt: null,
        lastPasswordResetSentAt: null,
        failedLoginCount: 0,
        loginLockedUntil: null,
        ...overrides,
      }) as User;

    it('returns null without bcrypt check when the user is currently locked', async () => {
      const lockedUser = buildUser({ loginLockedUntil: new Date(Date.now() + 60_000) });
      jest.spyOn(usersService, 'findOne').mockResolvedValue(lockedUser);
      rateLimitService.checkLoginLock.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });

      const result = await authService.getUserByUsernameAndAuthenticationDetails(lockedUser.username, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: 'right-password' },
      });

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(rateLimitService.applyLoginFailure).not.toHaveBeenCalled();
    });

    it('persists the new lock state on a bad password that crosses the threshold', async () => {
      const user = buildUser({ failedLoginCount: 9 });
      jest.spyOn(usersService, 'findOne').mockResolvedValue(user);
      rateLimitService.checkLoginLock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
      rateLimitService.applyLoginFailure.mockResolvedValue({
        failedLoginCount: 0,
        loginLockedUntil: new Date(Date.now() + 900_000),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      jest.spyOn(authenticationDetailRepository, 'findOne').mockResolvedValue({
        userId: user.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
      } as AuthenticationDetail);

      const result = await authService.getUserByUsernameAndAuthenticationDetails(user.username, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: 'wrong' },
      });

      expect(result).toBeNull();
      expect(rateLimitService.applyLoginFailure).toHaveBeenCalledWith(user);
      expect(userRepository.update).toHaveBeenCalledWith(user.id, {
        failedLoginCount: 0,
        loginLockedUntil: expect.any(Date),
      });
    });

    it('clears the counter and lock on successful login', async () => {
      const user = buildUser({ failedLoginCount: 3 });
      jest.spyOn(usersService, 'findOne').mockResolvedValue(user);
      rateLimitService.checkLoginLock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(authenticationDetailRepository, 'findOne').mockResolvedValue({
        userId: user.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
      } as AuthenticationDetail);

      const result = await authService.getUserByUsernameAndAuthenticationDetails(user.username, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: 'right' },
      });

      expect(result).toEqual(user);
      expect(userRepository.update).toHaveBeenCalledWith(user.id, {
        failedLoginCount: 0,
        loginLockedUntil: null,
      });
    });

    it('does not enforce lockout for SSO logins', async () => {
      const user = buildUser();
      jest.spyOn(usersService, 'findOne').mockResolvedValue(user);
      jest.spyOn(authenticationDetailRepository, 'findOne').mockResolvedValue({
        userId: user.id,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 1,
        ssoSubject: 'sub',
      } as AuthenticationDetail);

      const result = await authService.getUserByUsernameAndAuthenticationDetails(user.username, {
        type: AuthenticationType.SSO,
        details: { providerType: SSOProviderType.OIDC, providerId: 1, subject: 'sub' },
      });

      expect(result).toEqual(user);
      expect(rateLimitService.checkLoginLock).not.toHaveBeenCalled();
      expect(rateLimitService.applyLoginFailure).not.toHaveBeenCalled();
    });
  });
});

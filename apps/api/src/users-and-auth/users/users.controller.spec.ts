import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { User, AuthenticationType, Setting } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { CreateUserDto } from './dtos/createUser.dto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: UsersService;
  let authService: AuthService;
  let emailService: EmailService;
  let settingRepository: {
    findOne: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            createOne: jest.fn(),
            deleteOne: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            createJWT: jest.fn(),
            addAuthenticationDetails: jest.fn(),
            generateEmailVerificationToken: jest.fn(),
            removeAuthenticationDetails: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Setting),
          useValue: {
            findOne: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get<UsersService>(UsersService);
    authService = module.get<AuthService>(AuthService);
    emailService = module.get<EmailService>(EmailService);
    settingRepository = module.get(getRepositoryToken(Setting));
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserById', () => {
    it('should return a user by ID', async () => {
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

      const mockRequest: Partial<AuthenticatedRequest> = {
        user: {
          ...user,
          jwtTokenId: 'test-jwt-token-id',
        },
        authInfo: { tokenId: 'test-token' },
        logout: jest.fn(),
      };

      const response = await controller.getOneById(user.id, mockRequest as AuthenticatedRequest);
      expect(response).toEqual(user);
    });
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        isEmailVerified: false,
        emailVerificationToken: 'token',
        emailVerificationTokenExpiresAt: new Date(),
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

      jest.spyOn(usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: 1,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed-password',
        user: {} as User,
      });

      const createUserDto: CreateUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      const response = await controller.createOne(createUserDto);
      expect(response).toEqual(user);
      expect(authService.addAuthenticationDetails).toHaveBeenCalledWith(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: {
          password: createUserDto.password,
        },
      });
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'verification-token');
    });

    it('should throw if email domain is not whitelisted', async () => {
      settingRepository.findOne.mockResolvedValue({ value: 'example.com, allowed.com' });

      const createUserDto: CreateUserDto = {
        username: 'testuser',
        email: 'notallowed@bar.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      await expect(controller.createOne(createUserDto)).rejects.toBeInstanceOf(ForbiddenSignupDomainException);
    });

    it('should allow when email domain is whitelisted', async () => {
      settingRepository.findOne.mockResolvedValue({ value: 'allowed.com' });
      const user = {
        id: 2,
        username: 'alice',
        email: 'alice@allowed.com',
        systemPermissions: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        resourceIntroductions: [],
        resourceUsages: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
      } as User;

      jest.spyOn(usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 2,
        userId: 2,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const dto: CreateUserDto = {
        username: 'alice',
        email: 'alice@allowed.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      const response = await controller.createOne(dto);
      expect(response).toEqual(user);
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'verification-token');
    });
  });

  describe('local signup domain whitelist endpoints', () => {
    it('getLocalSignupDomainWhitelist should return default "*" when missing', async () => {
      settingRepository.findOne.mockResolvedValue(null);
      const result = await controller.getLocalSignupDomainWhitelist();
      expect(result).toEqual(['*']);
    });

    it('getLocalSignupDomainWhitelist should parse and normalize domains', async () => {
      settingRepository.findOne.mockResolvedValue({ value: ' Example.COM ,allowed.org,  ,Another.Net ' });
      const result = await controller.getLocalSignupDomainWhitelist();
      expect(result).toEqual(['example.com', 'allowed.org', 'another.net']);
    });

    it('setLocalSignupDomainWhitelist should update repository with joined list', async () => {
      await controller.setLocalSignupDomainWhitelist(['example.com', 'allowed.org']);
      expect(settingRepository.update).toHaveBeenCalledWith(
        { parent: 'auth', key: 'local_signup_domain_whitelist' },
        { value: 'example.com,allowed.org' },
      );
    });

    it('isLocalSignupEnabled should return false when list is empty', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '' });
      const result = await controller.isLocalSignupEnabled();
      expect(result).toEqual({ value: false });
    });

    it('isLocalSignupEnabled should return true when list has any value', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
      const result = await controller.isLocalSignupEnabled();
      expect(result).toEqual({ value: true });
    });
  });
});

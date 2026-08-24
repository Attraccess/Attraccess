import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthenticationDetail, AuthenticationType, Setting, User } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRegistrationService } from './user-registration.service';
import { SignupDomainService } from './signup-domain.service';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { CreateUserDto } from './dtos/createUser.dto';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';

describe('UserRegistrationService', () => {
  let service: UserRegistrationService;
  let usersService: UsersService;
  let authService: AuthService;
  let emailService: EmailService;
  let settingRepository: { findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRegistrationService,
        // Real SignupDomainService so the domain-whitelist check is genuinely exercised
        SignupDomainService,
        {
          provide: getRepositoryToken(Setting),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findMany: jest.fn(),
            createOne: jest.fn(),
            deleteOne: jest.fn(),
            rollbackFailedRegistration: jest.fn(),
            countUsers: jest.fn(),
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
        {
          provide: EmailService,
          useValue: { sendVerificationEmail: jest.fn() },
        },
        {
          provide: PasswordPolicyService,
          useValue: {
            validate: jest.fn(async () => ({ ok: true, errors: [], zxcvbn: { score: 4, required: 3 } })),
            resolveRole: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserRegistrationService>(UserRegistrationService);
    usersService = module.get<UsersService>(UsersService);
    authService = module.get<AuthService>(AuthService);
    emailService = module.get<EmailService>(EmailService);
    settingRepository = module.get(getRepositoryToken(Setting));
  });

  describe('createOne', () => {
    it('should create a new user', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
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

      const response = await service.createOne(createUserDto);
      expect(response).toEqual(user);
      expect(authService.addAuthenticationDetails).toHaveBeenCalledWith(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: createUserDto.password },
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

      await expect(service.createOne(createUserDto)).rejects.toBeInstanceOf(ForbiddenSignupDomainException);
    });

    it('should allow when email domain is whitelisted', async () => {
      settingRepository.findOne.mockResolvedValue({ value: 'allowed.com' });
      const user = {
        id: 2,
        username: 'alice',
        email: 'alice@allowed.com',
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

      const response = await service.createOne(dto);
      expect(response).toEqual(user);
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'verification-token');
    });

    it('explains that SMTP must be configured and rolls back when sending verification email fails', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = { id: 1, username: 'testuser', email: 'test@example.com' } as User;
      const authenticationDetails = {
        id: 1,
        userId: user.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed-password',
        user,
      };
      jest.spyOn(usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue(authenticationDetails);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(emailService, 'sendVerificationEmail').mockRejectedValue(new Error('SMTP configuration not set'));

      const result = service.createOne({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      });

      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toMatchObject({
        response: {
          message: 'SMTP is not configured. Configure email before sending email.',
          statusCode: 400,
        },
      });
      expect(usersService.rollbackFailedRegistration).toHaveBeenCalledWith(user.id);
    });

    it('preserves the SMTP configuration error when registration rollback fails', async () => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = { id: 1, username: 'testuser', email: 'test@example.com' } as User;
      jest.spyOn(usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({ id: 1 } as AuthenticationDetail);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(emailService, 'sendVerificationEmail').mockRejectedValue(new Error('SMTP configuration not set'));
      jest.spyOn(usersService, 'rollbackFailedRegistration').mockRejectedValue(new Error('Database unavailable'));

      await expect(
        service.createOne({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password',
          strategy: AuthenticationType.LOCAL_PASSWORD,
        }),
      ).rejects.toMatchObject({
        response: {
          message: 'SMTP is not configured. Configure email before sending email.',
          statusCode: 400,
        },
      });
    });
  });

  describe('createOne with overwriteFirstTimeAdmin', () => {
    const unverifiedAdmin = {
      id: 1,
      username: 'admin',
      email: 'wrong@example.com',
      isEmailVerified: false,
    } as User;

    const newAdmin = { ...unverifiedAdmin, id: 2, email: 'correct@example.com' } as User;

    const dto: CreateUserDto & { overwriteFirstTimeAdmin: true } = {
      username: 'admin',
      email: 'correct@example.com',
      password: 'password123',
      strategy: AuthenticationType.LOCAL_PASSWORD,
      overwriteFirstTimeAdmin: true,
    };

    beforeEach(() => {
      settingRepository.findOne.mockResolvedValue({ value: '*' });
    });

    it('deletes the existing unverified admin and creates a fresh one', async () => {
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(1);
      jest.spyOn(usersService, 'findMany').mockResolvedValue({ data: [unverifiedAdmin], total: 1, page: 1, limit: 1 });
      jest.spyOn(usersService, 'deleteOne').mockResolvedValue(undefined);
      jest.spyOn(usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: newAdmin.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const result = await service.createOne(dto);

      expect(usersService.deleteOne).toHaveBeenCalledWith(unverifiedAdmin.id);
      expect(usersService.createOne).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(newAdmin, 'verification-token');
      expect(result).toEqual(newAdmin);
    });

    it('throws ForbiddenException when total users is not exactly 1', async () => {
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(2);

      await expect(service.createOne(dto)).rejects.toThrow(ForbiddenException);
      expect(usersService.deleteOne).not.toHaveBeenCalled();
      expect(usersService.createOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when no users exist', async () => {
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(0);

      await expect(service.createOne(dto)).rejects.toThrow(ForbiddenException);
      expect(usersService.deleteOne).not.toHaveBeenCalled();
      expect(usersService.createOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the single existing user has a verified email', async () => {
      const verified = { ...unverifiedAdmin, isEmailVerified: true } as User;
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(1);
      jest.spyOn(usersService, 'findMany').mockResolvedValue({ data: [verified], total: 1, page: 1, limit: 1 });

      await expect(service.createOne(dto)).rejects.toThrow(ForbiddenException);
      expect(usersService.deleteOne).not.toHaveBeenCalled();
      expect(usersService.createOne).not.toHaveBeenCalled();
    });

    it('checks the first-time-setup invariant BEFORE touching credentials (no user enumeration)', async () => {
      const callOrder: string[] = [];
      jest.spyOn(usersService, 'countUsers').mockImplementation(async () => {
        callOrder.push('countUsers');
        return 2;
      });
      const findOneSpy = jest.spyOn(usersService, 'findOne').mockImplementation(async () => {
        callOrder.push('findOne');
        return unverifiedAdmin;
      });

      await expect(service.createOne(dto)).rejects.toThrow(ForbiddenException);

      expect(callOrder[0]).toBe('countUsers');
      expect(findOneSpy).not.toHaveBeenCalled();
    });

    it('ignores the overwrite flag when not set (normal create flow)', async () => {
      jest.spyOn(usersService, 'countUsers').mockResolvedValue(5);
      jest.spyOn(usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: newAdmin.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const regularDto: CreateUserDto = {
        username: 'someone',
        email: 'someone@example.com',
        password: 'password123',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      await service.createOne(regularDto);

      expect(usersService.deleteOne).not.toHaveBeenCalled();
      expect(usersService.countUsers).not.toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { SSOService } from '../auth/sso/sso.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Setting, User } from '@attraccess/database-entities';

describe('UsersController – resendVerificationEmail', () => {
  let controller: UsersController;

  const usersService = {
    findOne: jest.fn(),
    createOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    findMany: jest.fn(),
    getTotalCount: jest.fn(),
    isSSOUser: jest.fn(),
    findOneById: jest.fn(),
    requestDeleteAccount: jest.fn(),
    confirmDeleteAccount: jest.fn(),
  };

  const authService = {
    generateEmailVerificationToken: jest.fn(),
    verifyEmail: jest.fn(),
    addAuthenticationDetails: jest.fn(),
    removeAuthenticationDetails: jest.fn(),
    generatePasswordResetToken: jest.fn(),
    changePassword: jest.fn(),
    validateAuthenticationDetails: jest.fn(),
    getUserByUsernameAndAuthenticationDetails: jest.fn(),
    userHasSSOAuthentication: jest.fn(),
    findSSOAuthenticationDetail: jest.fn(),
    updateSSOSubject: jest.fn(),
    removeLocalPasswordAuthentication: jest.fn(),
  };

  const emailService = {
    sendVerificationEmail: jest.fn(),
    sendUserInvitationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendPasswordChangedEmail: jest.fn(),
    sendUsernameChangedEmail: jest.fn(),
    sendDeleteAccountConfirmationEmail: jest.fn(),
  };

  const ssoService = {
    findAll: jest.fn(),
    findOneById: jest.fn(),
  };

  const settingRepository = {
    findOne: jest.fn(),
  };

  const tokenHashService = {
    hashToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: AuthService, useValue: authService },
        { provide: EmailService, useValue: emailService },
        { provide: SSOService, useValue: ssoService },
        { provide: getRepositoryToken(Setting), useValue: settingRepository },
        { provide: TokenHashService, useValue: tokenHashService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should return OK when no user exists with the given email', async () => {
    usersService.findOne.mockResolvedValue(null);

    const result = await controller.resendVerificationEmail({ email: 'nonexistent@example.com' });

    expect(result).toEqual({ message: 'OK' });
    expect(usersService.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' });
    expect(authService.generateEmailVerificationToken).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('should return OK when user email is already verified (no email sent)', async () => {
    const verifiedUser: Partial<User> = {
      id: 1,
      email: 'verified@example.com',
      isEmailVerified: true,
    };
    usersService.findOne.mockResolvedValue(verifiedUser);

    const result = await controller.resendVerificationEmail({ email: 'verified@example.com' });

    expect(result).toEqual({ message: 'OK' });
    expect(authService.generateEmailVerificationToken).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('should generate a new token and send verification email for unverified user', async () => {
    const unverifiedUser: Partial<User> = {
      id: 2,
      email: 'unverified@example.com',
      isEmailVerified: false,
    };
    usersService.findOne.mockResolvedValue(unverifiedUser);
    authService.generateEmailVerificationToken.mockResolvedValue('new-token-123');
    emailService.sendVerificationEmail.mockResolvedValue(undefined);

    const result = await controller.resendVerificationEmail({ email: 'unverified@example.com' });

    expect(result).toEqual({ message: 'OK' });
    expect(usersService.findOne).toHaveBeenCalledWith({ email: 'unverified@example.com' });
    expect(authService.generateEmailVerificationToken).toHaveBeenCalledWith(unverifiedUser);
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(unverifiedUser, 'new-token-123');
  });

  it('should throw ServiceUnavailableException when SMTP connection is refused', async () => {
    const unverifiedUser: Partial<User> = {
      id: 3,
      email: 'smtp-fail@example.com',
      isEmailVerified: false,
    };
    usersService.findOne.mockResolvedValue(unverifiedUser);
    authService.generateEmailVerificationToken.mockResolvedValue('token');
    emailService.sendVerificationEmail.mockRejectedValue({ code: 'ECONNREFUSED' });

    await expect(controller.resendVerificationEmail({ email: 'smtp-fail@example.com' })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should throw ServiceUnavailableException when SMTP connection times out', async () => {
    const unverifiedUser: Partial<User> = {
      id: 4,
      email: 'timeout@example.com',
      isEmailVerified: false,
    };
    usersService.findOne.mockResolvedValue(unverifiedUser);
    authService.generateEmailVerificationToken.mockResolvedValue('token');
    emailService.sendVerificationEmail.mockRejectedValue({ code: 'ETIMEDOUT' });

    await expect(controller.resendVerificationEmail({ email: 'timeout@example.com' })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should throw ServiceUnavailableException when SMTP connection resets', async () => {
    const unverifiedUser: Partial<User> = {
      id: 5,
      email: 'reset@example.com',
      isEmailVerified: false,
    };
    usersService.findOne.mockResolvedValue(unverifiedUser);
    authService.generateEmailVerificationToken.mockResolvedValue('token');
    emailService.sendVerificationEmail.mockRejectedValue({ code: 'ECONNRESET' });

    await expect(controller.resendVerificationEmail({ email: 'reset@example.com' })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should re-throw unexpected errors from email service', async () => {
    const unverifiedUser: Partial<User> = {
      id: 6,
      email: 'other-error@example.com',
      isEmailVerified: false,
    };
    usersService.findOne.mockResolvedValue(unverifiedUser);
    authService.generateEmailVerificationToken.mockResolvedValue('token');
    const unexpectedError = new Error('Unexpected template error');
    emailService.sendVerificationEmail.mockRejectedValue(unexpectedError);

    await expect(controller.resendVerificationEmail({ email: 'other-error@example.com' })).rejects.toThrow(
      'Unexpected template error',
    );
  });

  it('should re-throw errors from token generation', async () => {
    const unverifiedUser: Partial<User> = {
      id: 7,
      email: 'token-error@example.com',
      isEmailVerified: false,
    };
    usersService.findOne.mockResolvedValue(unverifiedUser);
    const tokenError = new Error('Token generation failed');
    authService.generateEmailVerificationToken.mockRejectedValue(tokenError);

    await expect(controller.resendVerificationEmail({ email: 'token-error@example.com' })).rejects.toThrow(
      'Token generation failed',
    );
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('should not reveal whether the email exists (same response for all cases)', async () => {
    usersService.findOne.mockResolvedValue(null);
    const noUserResult = await controller.resendVerificationEmail({ email: 'no@example.com' });

    usersService.findOne.mockResolvedValue({ id: 1, email: 'yes@example.com', isEmailVerified: true });
    const verifiedResult = await controller.resendVerificationEmail({ email: 'yes@example.com' });

    usersService.findOne.mockResolvedValue({ id: 2, email: 'new@example.com', isEmailVerified: false });
    authService.generateEmailVerificationToken.mockResolvedValue('t');
    emailService.sendVerificationEmail.mockResolvedValue(undefined);
    const unverifiedResult = await controller.resendVerificationEmail({ email: 'new@example.com' });

    expect(noUserResult).toEqual({ message: 'OK' });
    expect(verifiedResult).toEqual({ message: 'OK' });
    expect(unverifiedResult).toEqual({ message: 'OK' });
  });

  it('should call findOne with the exact email from the DTO', async () => {
    usersService.findOne.mockResolvedValue(null);

    await controller.resendVerificationEmail({ email: 'UPPER@CASE.COM' });

    expect(usersService.findOne).toHaveBeenCalledWith({ email: 'UPPER@CASE.COM' });
  });
});

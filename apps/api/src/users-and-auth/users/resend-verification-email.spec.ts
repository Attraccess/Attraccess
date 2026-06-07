import { Test, TestingModule } from '@nestjs/testing';
import { UserRegistrationService } from './user-registration.service';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { SignupDomainService } from './signup-domain.service';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { User } from '@attraccess/database-entities';

describe('UserRegistrationService – resendVerificationEmail', () => {
  let service: UserRegistrationService;

  const usersService = {
    findOne: jest.fn(),
  };

  const authService = {
    generateEmailVerificationToken: jest.fn(),
  };

  const emailService = {
    sendVerificationEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRegistrationService,
        { provide: UsersService, useValue: usersService },
        { provide: AuthService, useValue: authService },
        { provide: EmailService, useValue: emailService },
        { provide: SignupDomainService, useValue: { assertEmailDomainAllowed: jest.fn() } },
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
  });

  it('should resolve when no user exists with the given email', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(service.resendVerificationEmail('nonexistent@example.com')).resolves.toBeUndefined();

    expect(usersService.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' });
    expect(authService.generateEmailVerificationToken).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('should resolve when user email is already verified (no email sent)', async () => {
    const verifiedUser: Partial<User> = {
      id: 1,
      email: 'verified@example.com',
      isEmailVerified: true,
    };
    usersService.findOne.mockResolvedValue(verifiedUser);

    await expect(service.resendVerificationEmail('verified@example.com')).resolves.toBeUndefined();

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

    await service.resendVerificationEmail('unverified@example.com');

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

    await expect(service.resendVerificationEmail('smtp-fail@example.com')).rejects.toThrow(ServiceUnavailableException);
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

    await expect(service.resendVerificationEmail('timeout@example.com')).rejects.toThrow(ServiceUnavailableException);
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

    await expect(service.resendVerificationEmail('reset@example.com')).rejects.toThrow(ServiceUnavailableException);
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

    await expect(service.resendVerificationEmail('other-error@example.com')).rejects.toThrow(
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

    await expect(service.resendVerificationEmail('token-error@example.com')).rejects.toThrow('Token generation failed');
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('should call findOne with the exact email passed in', async () => {
    usersService.findOne.mockResolvedValue(null);

    await service.resendVerificationEmail('UPPER@CASE.COM');

    expect(usersService.findOne).toHaveBeenCalledWith({ email: 'UPPER@CASE.COM' });
  });
});

// Tests for per-account cooldown on the reset-password endpoint handler
// FEATURE: Rate limiting for password reset email trigger
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../../email/email.service';
import { SSOService } from '../auth/sso/sso.service';
import { TokenHashService } from '../../encryption/token-hash.service';
import { Setting, User } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RateLimitService } from '../../rate-limit/rate-limit.service';

describe('UsersController.requestPasswordReset (cooldown)', () => {
  let controller: UsersController;
  const usersService = {
    findOne: jest.fn(),
    isSSOUser: jest.fn().mockResolvedValue(false),
  };
  const authService = {
    generatePasswordResetToken: jest.fn(),
  };
  const emailService = {
    sendPasswordResetEmail: jest.fn(),
  };
  const settingRepository = {};
  const userRepository = { update: jest.fn() };
  const rateLimitService = {
    accountCooldown: jest.fn(),
  };
  const ssoService = {};
  const tokenHashService = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    rateLimitService.accountCooldown.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: AuthService, useValue: authService },
        { provide: EmailService, useValue: emailService },
        { provide: SSOService, useValue: ssoService },
        { provide: TokenHashService, useValue: tokenHashService },
        { provide: getRepositoryToken(Setting), useValue: settingRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: RateLimitService, useValue: rateLimitService },
      ],
    }).compile();

    controller = module.get(UsersController);
  });

  it('returns OK without sending mail when within the cooldown', async () => {
    const user = {
      id: 1,
      email: 'cool@example.com',
      isEmailVerified: true,
      lastPasswordResetSentAt: new Date(Date.now() - 5_000),
    } as User;
    authService.generatePasswordResetToken.mockResolvedValue('tok');
    usersService.findOne.mockResolvedValue(user);
    rateLimitService.accountCooldown.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });

    const result = await controller.requestPasswordReset({ email: user.email });

    expect(result).toEqual({ message: 'OK' });
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('updates lastPasswordResetSentAt after a successful send', async () => {
    const user = {
      id: 2,
      email: 'fresh@example.com',
      isEmailVerified: true,
      lastPasswordResetSentAt: null,
    } as User;
    authService.generatePasswordResetToken.mockResolvedValue('tok');
    usersService.findOne.mockResolvedValue(user);

    await controller.requestPasswordReset({ email: user.email });

    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(user, 'tok');
    expect(userRepository.update).toHaveBeenCalledWith(user.id, {
      lastPasswordResetSentAt: expect.any(Date),
    });
  });

  it('returns OK without invoking rate limiter when no user exists', async () => {
    authService.generatePasswordResetToken.mockResolvedValue(null);

    const result = await controller.requestPasswordReset({ email: 'unknown@example.com' });

    expect(result).toEqual({ message: 'OK' });
    expect(rateLimitService.accountCooldown).not.toHaveBeenCalled();
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

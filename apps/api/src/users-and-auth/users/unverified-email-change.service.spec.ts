import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserAccount } from '@attraccess/application-models';
import { AuthenticationType } from '@attraccess/application-models';
import { UnverifiedEmailChangeService } from './unverified-email-change.service';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';
import { AccountLockedException } from '../rate-limiting/exceptions';

describe('UnverifiedEmailChangeService', () => {
  const user = { id: 7, username: 'jane', email: 'old@example.org', isEmailVerified: false } as UserAccount;
  const dto = { identifier: 'jane', password: 'secret', newEmail: 'new@example.org' };
  const request = { ipAddress: '203.0.113.9', userAgent: 'jest' };

  let usersService: { findByLoginIdentifier: jest.Mock; changeEmail: jest.Mock };
  let authService: { validateAuthenticationDetails: jest.Mock; generateEmailVerificationToken: jest.Mock };
  let emailService: { sendVerificationEmail: jest.Mock };
  let signupDomainService: { assertEmailDomainAllowed: jest.Mock };
  let bruteForce: { runAccountAttempt: jest.Mock; assertAccountAllowed: jest.Mock; recordAccountFailure: jest.Mock };
  let audit: { record: jest.Mock };
  let service: UnverifiedEmailChangeService;

  beforeEach(() => {
    usersService = { findByLoginIdentifier: jest.fn().mockResolvedValue(user), changeEmail: jest.fn() };
    authService = {
      validateAuthenticationDetails: jest.fn().mockResolvedValue(true),
      generateEmailVerificationToken: jest.fn().mockResolvedValue('token'),
    };
    emailService = { sendVerificationEmail: jest.fn() };
    signupDomainService = { assertEmailDomainAllowed: jest.fn() };
    bruteForce = {
      runAccountAttempt: jest.fn(async (_id: number, attempt: () => Promise<unknown>) => attempt()),
      assertAccountAllowed: jest.fn(),
      recordAccountFailure: jest.fn(),
    };
    audit = { record: jest.fn() };
    service = new UnverifiedEmailChangeService(
      usersService as never,
      authService as never,
      emailService as never,
      signupDomainService as never,
      bruteForce as never,
      audit as never,
    );
  });

  it('changes the email as the account itself, then audits it with the request origin', async () => {
    await service.changeUnverifiedEmail(dto, request);

    expect(authService.validateAuthenticationDetails).toHaveBeenCalledWith(7, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'secret' },
    });
    expect(signupDomainService.assertEmailDomainAllowed).toHaveBeenCalledWith('new@example.org');
    expect(usersService.changeEmail).toHaveBeenCalledWith(7, 'new@example.org', { id: 7 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'identity.unverified_email_changed',
        actor: { id: 7, authenticationMethod: null },
        subject: { type: 'identity.user', id: 7 },
        request,
      }),
    );
  });

  it('answers an unknown identifier exactly like a wrong password', async () => {
    usersService.findByLoginIdentifier.mockResolvedValue(null);
    const unknown = await service.changeUnverifiedEmail(dto).catch((e) => e);

    authService.validateAuthenticationDetails.mockResolvedValue(false);
    usersService.findByLoginIdentifier.mockResolvedValue(user);
    const wrong = await service.changeUnverifiedEmail(dto).catch((e) => e);

    for (const error of [unknown, wrong]) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe('UnkownUserOrPasswordException');
    }
    expect(usersService.changeEmail).not.toHaveBeenCalled();
  });

  it('counts a wrong password toward the account lockout', async () => {
    authService.validateAuthenticationDetails.mockResolvedValue(false);
    await expect(service.changeUnverifiedEmail(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(bruteForce.recordAccountFailure).toHaveBeenCalledWith(7);
  });

  it('refuses a locked account before checking the password', async () => {
    bruteForce.assertAccountAllowed.mockRejectedValue(new AccountLockedException(60));
    await expect(service.changeUnverifiedEmail(dto)).rejects.toBeInstanceOf(AccountLockedException);
    expect(authService.validateAuthenticationDetails).not.toHaveBeenCalled();
  });

  it('refuses an already verified account and changes nothing', async () => {
    usersService.findByLoginIdentifier.mockResolvedValue({ ...user, isEmailVerified: true });
    await expect(service.changeUnverifiedEmail(dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersService.changeEmail).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('keeps the signup domain allowlist', async () => {
    signupDomainService.assertEmailDomainAllowed.mockRejectedValue(new ForbiddenSignupDomainException([]));
    await expect(service.changeUnverifiedEmail(dto)).rejects.toBeInstanceOf(ForbiddenSignupDomainException);
    expect(usersService.changeEmail).not.toHaveBeenCalled();
  });

  it('passes on a taken email as the directory reports it', async () => {
    usersService.changeEmail.mockRejectedValue(new BadRequestException('Email already exists'));
    await expect(service.changeUnverifiedEmail(dto)).rejects.toThrow('Email already exists');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('maps an unreachable mail server to 503 and does not audit a change', async () => {
    usersService.changeEmail.mockRejectedValue(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
    await expect(service.changeUnverifiedEmail(dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('sends a fresh link when the new address is the current one', async () => {
    await service.changeUnverifiedEmail({ ...dto, newEmail: 'OLD@example.org' });
    expect(usersService.changeEmail).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'token');
  });
});

import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { LoginRateLimitGuard } from './login.rate-limit.guard';
import { BruteForceProtectionService } from './brute-force.service';
import { UsersService } from '../users/users.service';
import { AuthAuditLogger } from './auth-audit.logger';
import { AccountLockedException, TooManyAuthAttemptsException } from './exceptions';

describe('login guard authentication and audit boundaries', () => {
  const protection = {
    assertIpAllowed: jest.fn(),
    assertAccountAllowed: jest.fn(),
    recordFailure: jest.fn(),
    recordSuccess: jest.fn(),
  };
  const users = { findOne: jest.fn() };
  const audit = { log: jest.fn() };
  let guard: LoginRateLimitGuard;
  let authenticate: jest.SpyInstance;
  const request = { ip: '192.0.2.10', body: { username: ' alice ' }, user: { id: 7, username: 'alice' } };
  const response = { setHeader: jest.fn() };
  const context = new ExecutionContextHost([request, response]);

  beforeEach(async () => {
    jest.resetAllMocks();
    users.findOne.mockResolvedValue({ id: 7, username: 'alice' });
    authenticate = jest
      .spyOn(Object.getPrototypeOf(LoginRateLimitGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        LoginRateLimitGuard,
        { provide: BruteForceProtectionService, useValue: protection },
        { provide: UsersService, useValue: users },
        { provide: AuthAuditLogger, useValue: audit },
      ],
    }).compile();
    guard = module.get(LoginRateLimitGuard);
  });
  afterEach(() => jest.restoreAllMocks());

  it('checks IP and account before authenticating and records the authenticated identity', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(protection.assertIpAllowed).toHaveBeenCalledWith('login', '192.0.2.10', 'alice');
    expect(protection.assertAccountAllowed).toHaveBeenCalledWith({ id: 7, username: 'alice' });
    expect(protection.recordSuccess).toHaveBeenCalledWith('login', '192.0.2.10', 7, 'alice');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success', userId: 7 }));
    expect(protection.assertAccountAllowed.mock.invocationCallOrder[0]).toBeLessThan(
      authenticate.mock.invocationCallOrder[0],
    );
  });
  it.each([
    ['assertIpAllowed', new TooManyAuthAttemptsException(12), 'rate_limited'],
    ['assertAccountAllowed', new AccountLockedException(45), 'account_locked'],
  ] as const)('blocks authentication when %s rejects', async (method, error, outcome) => {
    protection[method].mockRejectedValue(error);
    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(authenticate).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', String(error.retryAfterSeconds));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ outcome }));
    expect(protection.recordSuccess).not.toHaveBeenCalled();
  });
  it.each([
    [new UnauthorizedException(), 'invalid_credentials'],
    [new Error('TwoFactorRequired'), 'two_factor_required'],
    [new Error('TwoFactorInvalidCode'), 'two_factor_invalid'],
    [new Error('UserEmailNotVerifiedException'), 'email_not_verified'],
    [new AccountLockedException(5), 'account_locked'],
    [new TooManyAuthAttemptsException(5), 'rate_limited'],
    ['unexpected failure', 'invalid_credentials'],
  ])('records failed authentication without swallowing the original failure', async (error, outcome) => {
    authenticate.mockRejectedValue(error);
    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(protection.recordFailure).toHaveBeenCalledWith('login', '192.0.2.10', 7, 'alice');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ outcome, userId: 7 }));
    expect(protection.recordSuccess).not.toHaveBeenCalled();
  });
  it('keeps unknown users in the IP bucket and still performs authentication', async () => {
    users.findOne.mockRejectedValue(new Error('not found'));
    authenticate.mockRejectedValue(new UnauthorizedException());
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(protection.assertAccountAllowed).not.toHaveBeenCalled();
    expect(protection.recordFailure).toHaveBeenCalledWith('login', '192.0.2.10', null, 'alice');
  });
});

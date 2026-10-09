import { LoginRateLimitGuard, resolveIp } from './login.rate-limit.guard';
import { Request, Response } from 'express';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { User } from '@attraccess/database-entities';
import { BruteForceProtectionService } from './brute-force.service';
import { SettingsService } from '../../settings/settings.service';
import { UsersService } from '../users/users.service';
import { AuthAuditLogger } from './auth-audit.logger';
import { AccountLockedException } from './exceptions';

describe('concurrent account login attempts', () => {
  it('admits only the remaining guess across email/username and different IPs', async () => {
    const user = { id: 7, lockedUntil: null } as User;
    const bruteForce = new BruteForceProtectionService(
      { update: jest.fn().mockResolvedValue(undefined) } as never,
      {
        getRateLimitPolicy: async () => ({
          maxAttempts: 3,
          windowSeconds: 60,
          lockoutDurationSeconds: 120,
          exponentialBackoff: false,
          backoffMultiplier: 2,
        }),
      } as SettingsService,
    );
    await bruteForce.recordFailure('login', 'seed-ip', user.id);
    await bruteForce.recordFailure('login', 'seed-ip', user.id);
    const guard = new LoginRateLimitGuard(
      bruteForce,
      { findByLoginIdentifier: jest.fn().mockResolvedValue(user) } as unknown as UsersService,
      { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuthAuditLogger,
    );
    const authenticate = jest
      .spyOn(Object.getPrototypeOf(LoginRateLimitGuard.prototype), 'canActivate')
      .mockImplementation(async () => {
        // Yield so all requests reach admission before the first failure is counted.
        await new Promise<void>((resolve) => setImmediate(resolve));
        throw new UnauthorizedException('UnkownUserOrPasswordException');
      });
    const responses: Array<{ setHeader: jest.Mock }> = [];
    try {
      const results = await Promise.allSettled(
        ['alice', 'Alice@Example.com', 'alice@example.com'].map((username, index) => {
          const request = { ip: `203.0.113.${index}`, body: { username } } as Request;
          const response = { setHeader: jest.fn() };
          responses.push(response);
          const context = {
            switchToHttp: () => ({
              getRequest: () => request,
              getResponse: () => response as unknown as Response,
            }),
          } as ExecutionContext;
          return guard.canActivate(context);
        }),
      );
      expect(authenticate).toHaveBeenCalledTimes(1);
      expect(results[0]).toMatchObject({ status: 'rejected', reason: expect.any(UnauthorizedException) });
      for (const result of results.slice(1)) {
        expect(result).toMatchObject({ status: 'rejected', reason: expect.any(AccountLockedException) });
      }
      for (const response of responses.slice(1)) {
        expect(response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
      }
    } finally {
      authenticate.mockRestore();
    }
  });
});

describe('resolveIp', () => {
  const createRequest = (overrides?: Partial<Request>): Request =>
    ({
      ip: '203.0.113.42',
      headers: {} as Request['headers'],
      socket: { remoteAddress: '198.51.100.7' } as Request['socket'],
      ...overrides,
    }) as Request;

  it('returns request.ip, which Express derives via the "trust proxy" setting', () => {
    expect(resolveIp(createRequest({ ip: '203.0.113.42' }))).toBe('203.0.113.42');
  });

  it('does NOT trust client-supplied forwarding headers itself (defers entirely to Express)', () => {
    const req = createRequest({
      ip: '172.20.0.6',
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '5.6.7.8',
        'cf-connecting-ip': '9.10.11.12',
      } as Request['headers'],
    });
    expect(resolveIp(req)).toBe('172.20.0.6');
  });

  it('falls back to socket.remoteAddress when request.ip is missing', () => {
    const req = createRequest({ ip: undefined, socket: { remoteAddress: '198.51.100.7' } as Request['socket'] });
    expect(resolveIp(req)).toBe('198.51.100.7');
  });

  it('returns "unknown" when neither request.ip nor socket address is available', () => {
    const req = createRequest({ ip: undefined, socket: { remoteAddress: undefined } as Request['socket'] });
    expect(resolveIp(req)).toBe('unknown');
  });

  it('collapses IPv4-mapped IPv6 addresses to their IPv4 form so each client gets one bucket', () => {
    expect(resolveIp(createRequest({ ip: '::ffff:127.0.0.1' }))).toBe('127.0.0.1');
    expect(resolveIp(createRequest({ ip: '::ffff:203.0.113.42' }))).toBe('203.0.113.42');
  });
});

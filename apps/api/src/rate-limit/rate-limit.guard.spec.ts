// Behavioural tests for the rate-limit NestJS guard used by login route
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_METADATA_KEY } from './rate-limit.constants';
import type { RateLimitMetadata } from './rate-limit.types';

describe('RateLimitGuard', () => {
  const setupContext = (metadata: RateLimitMetadata | null, ip = '198.51.100.1') => {
    const reflector = {
      get: jest.fn().mockImplementation((key: string) => (key === RATE_LIMIT_METADATA_KEY ? metadata : null)),
    } as unknown as Reflector;
    const setHeader = jest.fn();
    const ctx = {
      getHandler: () => () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ ip, ips: [ip] }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    return { reflector, ctx, setHeader };
  };

  it('returns true when no metadata is set', async () => {
    const { reflector, ctx } = setupContext(null);
    const rateLimit = { checkIp: jest.fn() } as unknown as RateLimitService;
    const guard = new RateLimitGuard(reflector, rateLimit);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(rateLimit.checkIp).not.toHaveBeenCalled();
  });

  it('returns true for silentOk mode (interceptor handles those)', async () => {
    const { reflector, ctx } = setupContext({ scope: 'emailTrigger', mode: 'silentOk' });
    const rateLimit = { checkIp: jest.fn() } as unknown as RateLimitService;
    const guard = new RateLimitGuard(reflector, rateLimit);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(rateLimit.checkIp).not.toHaveBeenCalled();
  });

  it('throws 429 with Retry-After when over the limit in 429 mode', async () => {
    const { reflector, ctx, setHeader } = setupContext({ scope: 'login', mode: '429' });
    const rateLimit = {
      checkIp: jest.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 42 }),
    } as unknown as RateLimitService;
    const guard = new RateLimitGuard(reflector, rateLimit);
    let caught: HttpException | null = null;
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      caught = err as HttpException;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(429);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 42);
  });

  it('returns true when the bucket allows the request', async () => {
    const { reflector, ctx } = setupContext({ scope: 'login', mode: '429' });
    const rateLimit = {
      checkIp: jest.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    } as unknown as RateLimitService;
    const guard = new RateLimitGuard(reflector, rateLimit);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

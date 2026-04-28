// Behavioural tests for the rate-limit NestJS interceptor and silentOk mode
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { ExecutionContext, HttpException, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, lastValueFrom } from 'rxjs';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { RateLimitService } from './rate-limit.service';
import {
  RATE_LIMIT_METADATA_KEY,
  RATE_LIMIT_SILENT_OK_BODY,
} from './rate-limit.constants';
import type { RateLimitMetadata } from './rate-limit.types';

describe('RateLimitInterceptor', () => {
  const setupContext = (metadata: RateLimitMetadata | null, ip = '198.51.100.1') => {
    const reflector = {
      get: jest.fn().mockImplementation((key: string) => (key === RATE_LIMIT_METADATA_KEY ? metadata : null)),
    } as unknown as Reflector;
    const setHeader = jest.fn();
    const ctx = {
      getHandler: () => () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ ip, ips: [ip], headers: {} }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    return { reflector, ctx, setHeader };
  };

  it('passes through when no metadata is set', async () => {
    const { reflector, ctx } = setupContext(null);
    const rateLimit = { checkIp: jest.fn() } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(reflector, rateLimit);
    const next: CallHandler = { handle: () => of('payload') };
    await expect(lastValueFrom(await interceptor.intercept(ctx, next))).resolves.toBe('payload');
    expect(rateLimit.checkIp).not.toHaveBeenCalled();
  });

  it('throws 429 with Retry-After when over the limit in 429 mode', async () => {
    const { reflector, ctx, setHeader } = setupContext({ scope: 'login', mode: '429' });
    const rateLimit = {
      checkIp: jest.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 42 }),
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(reflector, rateLimit);
    const next: CallHandler = { handle: () => of('payload') };
    let caught: HttpException | null = null;
    try {
      await firstValueFrom(await interceptor.intercept(ctx, next));
    } catch (err) {
      caught = err as HttpException;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(429);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 42);
  });

  it('returns silent OK when over the limit in silentOk mode', async () => {
    const { reflector, ctx } = setupContext({ scope: 'emailTrigger', mode: 'silentOk' });
    const rateLimit = {
      checkIp: jest.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 5 }),
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(reflector, rateLimit);
    const handle = jest.fn().mockReturnValue(of('payload'));
    const next: CallHandler = { handle };
    const result = await firstValueFrom(await interceptor.intercept(ctx, next));
    expect(result).toEqual(RATE_LIMIT_SILENT_OK_BODY);
    expect(handle).not.toHaveBeenCalled();
  });

  it('lets the request through when allowed', async () => {
    const { reflector, ctx } = setupContext({ scope: 'login', mode: '429' });
    const rateLimit = {
      checkIp: jest.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(reflector, rateLimit);
    const next: CallHandler = { handle: () => of('payload') };
    await expect(lastValueFrom(await interceptor.intercept(ctx, next))).resolves.toBe('payload');
  });
});

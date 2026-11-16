import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ApiTokenRequestRateLimitInterceptor } from './api-token-request-rate-limit.interceptor';

describe('API token request rate limit interceptor', () => {
  const noSkip = { getAllAndOverride: () => undefined };
  const setup = (user?: object, requestDetails: object = {}, type = 'http') => {
    const rateLimit = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn() };
    const next = { handle: jest.fn(() => of('response')) };
    const context = {
      getType: () => type,
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user, ...requestDetails }) }),
    } as unknown as ExecutionContext;
    const interceptor = new ApiTokenRequestRateLimitInterceptor(rateLimit as never, audit as never, noSkip as never);
    return { rateLimit, audit, next, context, interceptor };
  };
  it.each([undefined, { authenticationMethod: 'session' }, { authenticationMethod: 'api-token' }])(
    'passes non-token principals without charging a token limit: %j',
    async (user) => {
      const { interceptor, context, next, rateLimit } = setup(user);
      expect(await lastValueFrom(await interceptor.intercept(context, next))).toBe('response');
      expect(rateLimit.assertWithinLimit).not.toHaveBeenCalled();
    },
  );
  it('does not inspect HTTP state for another transport', async () => {
    const { interceptor, context, next, rateLimit } = setup(undefined, {}, 'ws');
    await interceptor.intercept(context, next);
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(rateLimit.assertWithinLimit).not.toHaveBeenCalled();
  });
  it('checks the token before dispatching its request', async () => {
    const { interceptor, context, next, rateLimit, audit } = setup({
      authenticationMethod: 'api-token',
      apiTokenId: 7,
    });
    expect(await lastValueFrom(await interceptor.intercept(context, next))).toBe('response');
    expect(rateLimit.assertWithinLimit).toHaveBeenCalledWith(7);
    expect(audit.log).not.toHaveBeenCalled();
  });
  it.each([
    [{ ip: '::ffff:127.0.0.1' }, '127.0.0.1'],
    [{ socket: { remoteAddress: '192.0.2.1' } }, '192.0.2.1'],
    [{}, 'unknown'],
  ])('audits rejected limits with the normalized client IP', async (details, ip) => {
    const { interceptor, context, next, rateLimit, audit } = setup(
      { id: 3, username: 'operator', authenticationMethod: 'api-token', apiTokenId: 7 },
      details as object,
    );
    const error = new Error('limited');
    rateLimit.assertWithinLimit.mockRejectedValue(error);
    await expect(interceptor.intercept(context, next)).rejects.toBe(error);
    expect(next.handle).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ ip, userId: 3, apiTokenId: 7, outcome: 'rate_limited' }),
    );
  });
  it.each([
    [true, 0],
    [false, 1],
  ])('leaves the charge to the forwarded requests when the route says so (%s)', async (forwarded, charges) => {
    const rateLimit = { assertWithinLimit: jest.fn() };
    const next = { handle: jest.fn(() => of('response')) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(() => forwarded) };
    const context = {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user: { authenticationMethod: 'api-token', apiTokenId: 7 } }) }),
    } as unknown as ExecutionContext;
    const interceptor = new ApiTokenRequestRateLimitInterceptor(
      rateLimit as never,
      { log: jest.fn() } as never,
      reflector as never,
    );
    expect(await lastValueFrom(await interceptor.intercept(context, next))).toBe('response');
    expect(rateLimit.assertWithinLimit).toHaveBeenCalledTimes(charges);
  });
});

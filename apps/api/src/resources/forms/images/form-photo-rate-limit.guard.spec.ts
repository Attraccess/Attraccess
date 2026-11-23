import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FormPhotoRateLimitGuard, FormPhotoRateLimitName } from './form-photo-rate-limit.guard';

describe('FormPhotoRateLimitGuard', () => {
  let now = 1_000_000;
  beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => now));
  afterEach(() => jest.restoreAllMocks());

  const call = (
    guard: FormPhotoRateLimitGuard,
    name: FormPhotoRateLimitName | undefined,
    ip = '192.0.2.10',
    user?: { id: number },
  ) => {
    Object.assign(guard, { reflector: { getAllAndOverride: () => name } as unknown as Reflector });
    const setHeader = jest.fn();
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ ip, user }), getResponse: () => ({ setHeader }) }),
    } as unknown as ExecutionContext;
    try {
      return { allowed: guard.canActivate(context), setHeader };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) return { allowed: false, setHeader };
      throw error;
    }
  };

  it('allows 30 writes in ten minutes per address, then answers 429 with Retry-After', () => {
    const guard = new FormPhotoRateLimitGuard({} as Reflector);
    for (let i = 0; i < 30; i++) expect(call(guard, 'write').allowed).toBe(true);

    const blocked = call(guard, 'write');

    expect(blocked.allowed).toBe(false);
    expect(blocked.setHeader).toHaveBeenCalledWith('Retry-After', '600');
    expect(call(guard, 'write', '192.0.2.11').allowed).toBe(true);
    now += 10 * 60_000;
    expect(call(guard, 'write').allowed).toBe(true);
  });

  it('limits reads separately from writes', () => {
    const guard = new FormPhotoRateLimitGuard({} as Reflector);
    for (let i = 0; i < 120; i++) expect(call(guard, 'read').allowed).toBe(true);
    expect(call(guard, 'read').allowed).toBe(false);
    expect(call(guard, 'write').allowed).toBe(true);
  });

  it('leaves a route without a limit alone', () => {
    const guard = new FormPhotoRateLimitGuard({} as Reflector);
    for (let i = 0; i < 500; i++) expect(call(guard, undefined).allowed).toBe(true);
  });

  it('shares one budget across an IPv6 /64', () => {
    const guard = new FormPhotoRateLimitGuard({} as Reflector);
    for (let i = 0; i < 30; i++) expect(call(guard, 'write', `2001:db8:1:2::${i + 1}`).allowed).toBe(true);
    expect(call(guard, 'write', '2001:db8:1:2:ffff::1').allowed).toBe(false);
  });

  it('limits signed-in uploads per user, whatever address they come from', () => {
    const guard = new FormPhotoRateLimitGuard({} as Reflector);
    for (let i = 0; i < 30; i++) expect(call(guard, 'upload', `192.0.2.${i + 1}`, { id: 5 }).allowed).toBe(true);

    expect(call(guard, 'upload', '198.51.100.1', { id: 5 }).allowed).toBe(false);
    expect(call(guard, 'upload', '192.0.2.1', { id: 6 }).allowed).toBe(true);
    // The public phone writes of the same address have their own budget.
    expect(call(guard, 'write', '192.0.2.1').allowed).toBe(true);
  });

  it('does not count an upload without a signed-in user (the sign-in guard refuses it)', () => {
    const guard = new FormPhotoRateLimitGuard({} as Reflector);
    for (let i = 0; i < 100; i++) expect(call(guard, 'upload').allowed).toBe(true);
  });
});

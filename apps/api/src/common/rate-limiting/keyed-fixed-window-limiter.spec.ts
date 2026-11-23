import { ExecutionContext, HttpException } from '@nestjs/common';
import { KeyedFixedWindowLimiter } from './keyed-fixed-window-limiter';

describe('KeyedFixedWindowLimiter', () => {
  let now = 1_000_000;
  beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => now));
  afterEach(() => jest.restoreAllMocks());

  const setHeader = jest.fn();
  const context = { switchToHttp: () => ({ getResponse: () => ({ setHeader }) }) } as unknown as ExecutionContext;
  const allowed = (
    limiter: KeyedFixedWindowLimiter<'short' | 'long'>,
    name: 'short' | 'long',
    key: string,
    cost = 1,
  ) => {
    try {
      limiter.hit(context, name, key, cost);
      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) return false;
      throw error;
    }
  };

  it('counts per limit and key, answers 429 with Retry-After over the limit, and opens a new window later', () => {
    const limiter = new KeyedFixedWindowLimiter({
      short: { limit: 2, windowMs: 60_000 },
      long: { limit: 1, windowMs: 600_000 },
    });

    expect(allowed(limiter, 'short', 'a', 2)).toBe(true);
    expect(allowed(limiter, 'short', 'a')).toBe(false);
    expect(setHeader).toHaveBeenLastCalledWith('Retry-After', '60');
    expect(allowed(limiter, 'short', 'b')).toBe(true);
    expect(allowed(limiter, 'long', 'a')).toBe(true);

    now += 60_000;
    expect(allowed(limiter, 'short', 'a')).toBe(true);
    // A new short window evicts only the short limit's stale entries.
    expect(allowed(limiter, 'long', 'a')).toBe(false);
  });
});

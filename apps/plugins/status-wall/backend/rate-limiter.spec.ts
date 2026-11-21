import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('allows `limit` hits per window and reports the seconds to wait', () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.hit('a', 0)).toBe(0);
    expect(limiter.hit('a', 1_000)).toBe(0);
    expect(limiter.hit('a', 2_000)).toBe(58);
    expect(limiter.hit('b', 2_000)).toBe(0);
    expect(limiter.hit('a', 60_000)).toBe(0); // new window
  });

  it('never tracks more than maxEntries keys, evicting the oldest window first', () => {
    const limiter = new RateLimiter(1, 60_000, 3);
    for (const key of ['a', 'b', 'c']) limiter.hit(key, 0);
    expect(limiter.hit('a', 1)).toBeGreaterThan(0); // a is limited
    limiter.hit('d', 2); // evicts a (oldest)
    expect(limiter.size).toBe(3);
    expect(limiter.hit('a', 3)).toBe(0); // a starts over, evicting b
    expect(limiter.hit('c', 4)).toBeGreaterThan(0); // c is still tracked
    for (let i = 0; i < 1_000; i += 1) limiter.hit(`flood-${i}`, 5);
    expect(limiter.size).toBe(3);
  });

  it('sweeps expired windows at most once per interval', () => {
    const limiter = new RateLimiter(5, 1_000, 100, 10_000);
    for (let i = 0; i < 10; i += 1) limiter.hit(`k${i}`, 0);
    limiter.hit('late', 5_000); // k0..k9 expired, but the last sweep (t=0) is too recent
    expect(limiter.size).toBe(11);
    limiter.hit('live', 9_500); // open until 10_500
    limiter.hit('later', 10_000); // sweep: drops k0..k9 and late, keeps live
    expect(limiter.size).toBe(2);
    expect(limiter.hit('live', 10_000)).toBe(0); // still counting in its window
  });
});

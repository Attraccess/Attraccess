import { ExpiringKeys, UserViewLimiter } from './mqtt-explorer-limits';

describe('ExpiringKeys', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('remembers a key for its time to live', () => {
    const keys = new ExpiringKeys(1_000, 10);
    keys.add('a');
    jest.advanceTimersByTime(999);
    expect(keys.has('a')).toBe(true);
    jest.advanceTimersByTime(1);
    expect(keys.has('a')).toBe(false);
    expect(keys.has('b')).toBe(false);
  });

  it('restarts the time to live when a key is added again', () => {
    const keys = new ExpiringKeys(1_000, 10);
    keys.add('a');
    jest.advanceTimersByTime(800);
    keys.add('a');
    jest.advanceTimersByTime(800);
    expect(keys.has('a')).toBe(true);
  });

  it('prunes expired keys and keeps at most the bound, dropping the oldest', () => {
    const keys = new ExpiringKeys(1_000, 3);
    keys.add('old');
    jest.advanceTimersByTime(1_000);
    keys.add('a');
    expect(keys.size).toBe(1);
    keys.add('b');
    keys.add('c');
    keys.add('d');
    expect(keys.size).toBe(3);
    expect(keys.has('a')).toBe(false);
    expect(['b', 'c', 'd'].every((key) => keys.has(key))).toBe(true);
  });
});

describe('UserViewLimiter', () => {
  it('counts per user, refuses beyond the maximum and releases once per slot', () => {
    const limiter = new UserViewLimiter(2);
    const first = limiter.reserve(1);
    const second = limiter.reserve(1);
    expect(first && second).toBeTruthy();
    expect(limiter.reserve(1)).toBeNull();
    expect(limiter.reserve(2)).not.toBeNull();
    first?.release();
    first?.release();
    expect(limiter.active(1)).toBe(1);
    expect(limiter.reserve(1)).not.toBeNull();
    expect(limiter.reserve(1)).toBeNull();
  });

  it('forgets a user without open views', () => {
    const limiter = new UserViewLimiter(1);
    limiter.reserve(1)?.release();
    expect(limiter.active(1)).toBe(0);
    expect((limiter as unknown as { counts: Map<number, number> }).counts.size).toBe(0);
  });
});

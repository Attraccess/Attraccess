import { BACKOFF_CAP_MS, backoffDelay } from './backoff';

describe('backoffDelay', () => {
  it('grows exponentially from one second, with full jitter below the ceiling', () => {
    expect(backoffDelay(0, () => 0.9999)).toBe(999);
    expect(backoffDelay(1, () => 0.9999)).toBe(1999);
    expect(backoffDelay(3, () => 0.5)).toBe(4000);
  });

  it('never exceeds the 60 second cap, however many attempts failed', () => {
    for (const attempt of [6, 7, 20, 1_000])
      expect(backoffDelay(attempt, () => 0.9999)).toBeLessThanOrEqual(BACKOFF_CAP_MS);
    expect(backoffDelay(10, () => 0.9999)).toBe(59_994);
  });

  it('jitters across the whole range but never spins at zero', () => {
    const samples = new Set(Array.from({ length: 50 }, () => backoffDelay(4)));
    expect(samples.size).toBeGreaterThan(10);
    expect(backoffDelay(5, () => 0)).toBeGreaterThan(0);
  });
});

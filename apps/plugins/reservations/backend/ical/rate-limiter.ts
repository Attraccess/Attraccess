/**
 * Fixed-window in-process rate limiter (single API instance, ATT-1146).
 *
 * Memory and CPU stay bounded under abuse: at most `maxEntries` keys are tracked (the oldest window is
 * evicted first) and expired windows are swept at most once per `pruneIntervalMs`, oldest first, stopping
 * at the first live one.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { resetAt: number; count: number }>();
  private lastPrune = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxEntries = 10_000,
    private readonly pruneIntervalMs = 1_000,
  ) {}

  /** Number of tracked keys (for tests and diagnostics). */
  get size(): number {
    return this.windows.size;
  }

  /** Counts a hit; returns the seconds to wait when over the limit, otherwise 0. */
  hit(key: string, now: number): number {
    this.prune(now);
    const entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      // Re-insert so Map order stays "oldest window first" for eviction.
      this.windows.delete(key);
      this.evictToFit();
      this.windows.set(key, { resetAt: now + this.windowMs, count: 1 });
      return 0;
    }
    entry.count += 1;
    return entry.count > this.limit ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0;
  }

  private prune(now: number): void {
    if (now - this.lastPrune < this.pruneIntervalMs) return;
    this.lastPrune = now;
    // Every window has the same length and is (re-)inserted when it opens, so Map order is resetAt order:
    // stop at the first live window.
    for (const [key, entry] of this.windows) {
      if (entry.resetAt > now) return;
      this.windows.delete(key);
    }
  }

  private evictToFit(): void {
    while (this.windows.size >= this.maxEntries) {
      const oldest = this.windows.keys().next();
      if (oldest.done) return;
      this.windows.delete(oldest.value);
    }
  }
}

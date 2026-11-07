/** Fixed-window in-process rate limiter (single API instance, ATT-1146). */
export class RateLimiter {
  private readonly windows = new Map<string, { resetAt: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Counts a hit; returns the seconds to wait when over the limit, otherwise 0. */
  hit(key: string, now: number): number {
    if (this.windows.size > 5000) this.prune(now);
    const entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      this.windows.set(key, { resetAt: now + this.windowMs, count: 1 });
      return 0;
    }
    entry.count += 1;
    return entry.count > this.limit ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.windows) if (entry.resetAt <= now) this.windows.delete(key);
  }
}

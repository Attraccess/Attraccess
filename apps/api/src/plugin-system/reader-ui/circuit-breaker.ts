export type BreakerCall = 'call' | 'probe' | 'open';

/**
 * Per-plugin circuit breaker for hook calls. Opens after `threshold` consecutive failures, lets one
 * probe call through after `probeAfterMs`, and closes again on the first success.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probing = false;

  constructor(
    private readonly threshold: number,
    private readonly probeAfterMs: number,
  ) {}

  get isOpen(): boolean {
    return this.openedAt !== null;
  }

  next(now: number): BreakerCall {
    if (this.openedAt === null) return 'call';
    if (!this.probing && now - this.openedAt >= this.probeAfterMs) {
      this.probing = true;
      return 'probe';
    }
    return 'open';
  }

  /** @returns true when the breaker was open and has now closed. */
  success(): boolean {
    const wasOpen = this.openedAt !== null;
    this.failures = 0;
    this.openedAt = null;
    this.probing = false;
    return wasOpen;
  }

  /** @returns true when this failure opened (or re-opened) the breaker. */
  failure(now: number): boolean {
    this.probing = false;
    this.failures += 1;
    if (this.openedAt !== null || this.failures >= this.threshold) {
      const opened = this.openedAt === null;
      this.openedAt = now;
      return opened;
    }
    return false;
  }

  /** Ends a probe without a verdict, so the next call may probe again. */
  release(): void {
    this.probing = false;
  }

  reset(): void {
    this.success();
  }
}

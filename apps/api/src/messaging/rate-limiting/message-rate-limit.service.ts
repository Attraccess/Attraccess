import { Injectable } from '@nestjs/common';
import {
  MAX_MESSAGE_RATE_COUNTERS,
  MessageRateLimit,
  MessageRateLimitScope,
  resolveMessageRateLimits,
} from './message-rate-limit.constants';
import { MessageRateLimitExceededException } from './message-rate-limit.exception';

interface WindowEntry {
  count: number;
  firstAt: number;
}

/**
 * Lightweight in-memory, per-user rate limiter for messaging actions.
 *
 * Keyed by `scope:userId` with a fixed window. No external dependency
 * (Redis/DB) — sufficient for abuse prevention on a single API instance and
 * mirrors the existing auth brute-force protection pattern.
 */
@Injectable()
export class MessageRateLimitService {
  private readonly counters = new Map<string, WindowEntry>();
  private readonly limits: Record<MessageRateLimitScope, MessageRateLimit> = resolveMessageRateLimits();
  private readonly nowFn: () => number = () => Date.now();

  /**
   * Records one action for the user within the scope and throws a 429 when the
   * configured limit is exceeded. Call this BEFORE performing the work.
   */
  public assertWithinLimit(scope: MessageRateLimitScope, userId: number): void {
    const limit = this.limits[scope];
    const windowMs = limit.windowSeconds * 1000;
    const now = this.nowFn();
    const key = `${scope}:${userId}`;

    this.evictStale(now, windowMs);

    const entry = this.counters.get(key);
    if (!entry || now - entry.firstAt >= windowMs) {
      this.counters.set(key, { count: 1, firstAt: now });
      return;
    }

    if (entry.count >= limit.maxActions) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.firstAt + windowMs - now) / 1000));
      throw new MessageRateLimitExceededException(retryAfterSeconds);
    }

    entry.count += 1;
  }

  private evictStale(now: number, windowMs: number): void {
    for (const [key, entry] of this.counters) {
      if (now - entry.firstAt >= windowMs) {
        this.counters.delete(key);
      }
    }
    if (this.counters.size > MAX_MESSAGE_RATE_COUNTERS) {
      const overflow = this.counters.size - MAX_MESSAGE_RATE_COUNTERS;
      const oldest = [...this.counters.entries()].sort(([, a], [, b]) => a.firstAt - b.firstAt);
      for (let i = 0; i < overflow && i < oldest.length; i += 1) {
        this.counters.delete(oldest[i][0]);
      }
    }
  }
}

import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { FixedWindowCounterStore, WindowCounterEntry } from './fixed-window-counter';

/** One named limit: at most `limit` units per `windowMs` and key. */
export interface FixedWindowLimit {
  limit: number;
  windowMs: number;
}

/**
 * The counting behind the in-memory, per-key fixed-window rate limit guards (MCP, form photos). A guard picks the
 * limit and the key of a request and calls `hit`. Each limit has its own store, so evicting one limit's stale windows
 * never resets another limit with a longer window. State is per process.
 */
export class KeyedFixedWindowLimiter<Name extends string> {
  private readonly counters = new Map<Name, FixedWindowCounterStore<string, WindowCounterEntry>>();

  constructor(
    private readonly limits: Record<Name, FixedWindowLimit>,
    private readonly maxEntries = 10_000,
  ) {}

  /** Counts `cost` units for the key under the limit; over the limit it sets `Retry-After` and throws 429. */
  hit(context: ExecutionContext, name: Name, key: string, cost = 1): void {
    const { limit, windowMs } = this.limits[name];
    const counters = this.store(name);
    const now = Date.now();
    let entry = counters.get(key);
    if (!entry || now - entry.firstAt >= windowMs) {
      counters.evict((candidate) => now - candidate.firstAt >= windowMs);
      entry = { count: 0, firstAt: now };
      counters.set(key, entry);
    }
    entry.count += cost;
    if (entry.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.firstAt + windowMs - now) / 1000));
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Forgets every window (tests that share one application between cases). */
  reset(): void {
    this.counters.clear();
  }

  private store(name: Name): FixedWindowCounterStore<string, WindowCounterEntry> {
    let store = this.counters.get(name);
    if (!store) {
      store = new FixedWindowCounterStore<string, WindowCounterEntry>(this.maxEntries);
      this.counters.set(name, store);
    }
    return store;
  }
}

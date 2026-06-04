/**
 * Minimum shape every fixed-window counter entry must have. Callers may extend
 * it with their own bookkeeping (e.g. lockout state for auth brute-force).
 */
export interface WindowCounterEntry {
  /** Number of actions recorded in the current window. */
  count: number;
  /** Epoch milliseconds when the current window started. */
  firstAt: number;
}

/**
 * Bounded, in-memory fixed-window counter store.
 *
 * Provides the storage + housekeeping that the auth brute-force protection and
 * the per-user messaging rate limiter both need: a per-key counter map, stale
 * entry eviction, and a hard capacity bound that drops the oldest entries under
 * abuse. The window/limit semantics (reset, thresholds, lockout, backoff) stay
 * with the caller — this class only owns bounded storage.
 */
export class FixedWindowCounterStore<K, E extends WindowCounterEntry> {
  private readonly entries = new Map<K, E>();

  constructor(private readonly maxEntries: number) {}

  get(key: K): E | undefined {
    return this.entries.get(key);
  }

  set(key: K, entry: E): void {
    this.entries.set(key, entry);
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Removes every entry the caller deems stale, then enforces the capacity
   * bound by dropping the oldest (lowest `firstAt`) entries that remain.
   */
  evict(isStale: (entry: E) => boolean): void {
    for (const [key, entry] of this.entries) {
      if (isStale(entry)) {
        this.entries.delete(key);
      }
    }

    if (this.entries.size > this.maxEntries) {
      const overflow = this.entries.size - this.maxEntries;
      const oldest = [...this.entries.entries()].sort(([, a], [, b]) => a.firstAt - b.firstAt);
      for (let i = 0; i < overflow && i < oldest.length; i += 1) {
        this.entries.delete(oldest[i][0]);
      }
    }
  }
}

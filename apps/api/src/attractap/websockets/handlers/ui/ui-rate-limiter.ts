import {
  FixedWindowCounterStore,
  type WindowCounterEntry,
} from '../../../../common/rate-limiting/fixed-window-counter';

/** At most one slot update per window and key (reader, resource, slot). */
export class UiSlotRateLimiter {
  private readonly store = new FixedWindowCounterStore<string, WindowCounterEntry>(2048);

  constructor(private readonly windowMs: number) {}

  /** @returns 0 when the update may be sent now, otherwise the milliseconds to wait. */
  take(key: string, now: number): number {
    const entry = this.store.get(key);
    if (!entry || now - entry.firstAt >= this.windowMs) {
      this.store.set(key, { count: 1, firstAt: now });
      this.store.evict((e) => now - e.firstAt >= this.windowMs * 4);
      return 0;
    }
    return entry.firstAt + this.windowMs - now;
  }
}

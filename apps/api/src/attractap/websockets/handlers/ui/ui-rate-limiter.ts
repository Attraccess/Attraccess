import {
  FixedWindowCounterStore,
  type WindowCounterEntry,
} from '../../../../common/rate-limiting/fixed-window-counter';
import type { UiSlotLimiter } from './ui-socket-state';

/** At most one slot update per window and key (resource, slot). One instance per reader connection. */
export class UiSlotRateLimiter implements UiSlotLimiter {
  private readonly store: FixedWindowCounterStore<string, WindowCounterEntry>;

  constructor(
    private readonly windowMs: number,
    maxEntries = 256,
  ) {
    this.store = new FixedWindowCounterStore<string, WindowCounterEntry>(maxEntries);
  }

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

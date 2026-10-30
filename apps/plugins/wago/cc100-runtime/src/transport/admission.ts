import { type DropReason } from '../../../shared/capabilities';
import type { MessageSlot } from '../runtime/types';

/** Default cap for subscriptions that do not declare one. */
export const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;

/** Messages handled at once per subscription. */
export const MAX_CONCURRENT_MESSAGES = 100;

/** Messages allowed to wait for a free slot; anything arriving beyond this is dropped. */
export const MAX_WAITING_MESSAGES = 100;

export type DropCounts = Record<DropReason, number>;

/** Counts dropped messages by reason. A drop is never answered, so the sender's own timeout is the only signal. */
export class DropCounters {
  private readonly counts: DropCounts = { oversized: 0, overload: 0 };

  record(reason: DropReason): void {
    this.counts[reason] += 1;
  }

  snapshot(): DropCounts {
    return { ...this.counts };
  }
}

type Waiting = { payload: Buffer; run: (payload: Buffer, slot: MessageSlot) => Promise<void> };

/**
 * Admission control for one subscription: a byte cap checked before any decoding, at most
 * `MAX_CONCURRENT_MESSAGES` messages running, and at most `MAX_WAITING_MESSAGES` queued behind them.
 */
export class SubscriptionAdmission {
  private running = 0;
  private readonly waiting: Waiting[] = [];

  constructor(
    private readonly maxBytes: number,
    private readonly counters: DropCounters,
    private readonly onError: (error: unknown) => void,
  ) {}

  admit(payload: Buffer, run: Waiting['run']): void {
    if (payload.byteLength > this.maxBytes) return this.counters.record('oversized');
    if (this.running >= MAX_CONCURRENT_MESSAGES) {
      if (this.waiting.length >= MAX_WAITING_MESSAGES) return this.counters.record('overload');
      this.waiting.push({ payload, run });
      return;
    }
    this.start({ payload, run });
  }

  private start({ payload, run }: Waiting): void {
    this.running += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.running -= 1;
      const next = this.waiting.shift();
      if (next) this.start(next);
    };
    void Promise.resolve()
      .then(() => run(payload, { release }))
      .catch(this.onError)
      .finally(release);
  }
}

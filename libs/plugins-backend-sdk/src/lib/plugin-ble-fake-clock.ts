/** Deterministic clock for the fake BLE transport: time only moves when a test calls `advance`. */
export class FakeBleClock {
  private current = 0;
  private sequence = 0;

  /** `epoch` is the wall-clock time (ms since 1970) at which the clock starts. */
  constructor(private readonly epoch = 0) {}
  private timers: Array<{ due: number; seq: number; fn: () => void }> = [];

  now(): number {
    return this.epoch + this.current;
  }

  /** Schedules `fn`; returns a function that cancels it. */
  setTimeout(fn: () => void, ms: number): () => void {
    const timer = { due: this.current + ms, seq: this.sequence++, fn };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((candidate) => candidate !== timer);
    };
  }

  /** Moves time forward, firing due timers in order and letting their promise chains settle in between. */
  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    await flushMicrotasks();
    for (;;) {
      const next = this.timers.filter((timer) => timer.due <= target).sort((a, b) => a.due - b.due || a.seq - b.seq)[0];
      if (!next) break;
      this.timers = this.timers.filter((timer) => timer !== next);
      this.current = Math.max(this.current, next.due);
      next.fn();
      await flushMicrotasks();
    }
    this.current = target;
    await flushMicrotasks();
  }
}

export async function flushMicrotasks(rounds = 25): Promise<void> {
  for (let index = 0; index < rounds; index++) await Promise.resolve();
}

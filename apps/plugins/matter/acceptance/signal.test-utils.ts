const WAIT_MS = 10_000;

/**
 * An event-driven wait: the condition is checked now and again whenever its source calls `notify()`. A wait that does
 * not end says what it waited for and what it saw instead.
 */
export class Signal {
  private readonly checks = new Set<() => void>();

  notify(): void {
    for (const check of [...this.checks]) check();
  }

  until(waitingFor: string, done: () => boolean, seen: () => unknown, timeoutMs = WAIT_MS): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!done()) return;
        clearTimeout(timer);
        this.checks.delete(check);
        resolve();
      };
      const timer = setTimeout(() => {
        this.checks.delete(check);
        reject(new Error(`waited ${timeoutMs} ms for ${waitingFor}; saw ${JSON.stringify(seen())}`));
      }, timeoutMs);
      this.checks.add(check);
      check();
    });
  }
}

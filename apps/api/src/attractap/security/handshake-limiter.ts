export class HandshakeRefusedError extends Error {}

/** Bounds concurrent TLS handshakes and the number waiting for a slot. */
export class HandshakeLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(
    private readonly maxActive = 32,
    private readonly maxWaiting = 256,
  ) {}

  public get queueDepth(): number {
    return this.waiting.length;
  }

  public get activeCount(): number {
    return this.active;
  }

  /** Resolves with a release function; rejects immediately when the wait queue is full. */
  public async acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.active < this.maxActive) {
      this.active++;
      return this.releaser();
    }
    if (this.waiting.length >= this.maxWaiting) throw new HandshakeRefusedError('handshake queue full');

    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener('abort', onAbort);
        this.active++; // taken synchronously so a newcomer cannot overtake the waiter
        resolve();
      };
      const onAbort = () => {
        const index = this.waiting.indexOf(grant);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(new HandshakeRefusedError('aborted while waiting'));
      };
      this.waiting.push(grant);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    return this.releaser();
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiting.shift()?.();
    };
  }
}

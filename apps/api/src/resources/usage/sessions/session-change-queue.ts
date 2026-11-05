import { MachineBusyError } from '../errors/machine-busy.error';
import { SessionChangeCoordination } from './session-change-coordination';

export const SESSION_CHANGE_WAIT_MS = 30_000;

/**
 * Runs the session changes (start, stop, takeover) of one machine one at a time, each from start through its
 * flow to commit or abort, so the session counts handed to flows stay consistent. Changes of this API instance
 * queue in memory; the optional coordination (Valkey) extends the same turn to other API instances.
 */
export class SessionChangeQueue {
  private readonly tails = new Map<number, Promise<void>>();

  /** Waits for the changes before this one (at most `waitMs`, then `MachineBusyError`), then runs the task. */
  async run<T>(
    resourceId: number,
    task: () => Promise<T>,
    waitMs = SESSION_CHANGE_WAIT_MS,
    coordination?: SessionChangeCoordination,
  ): Promise<T> {
    const previous = this.tails.get(resourceId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const tail = previous.then(() => current);
    this.tails.set(resourceId, tail);

    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    let releaseMachine: (() => Promise<void>) | undefined;
    try {
      await Promise.race([
        previous,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new MachineBusyError());
          }, waitMs);
        }),
      ]);
      clearTimeout(timer);
      // The whole wait, here and on other instances, stays within one `waitMs`.
      releaseMachine = await coordination?.acquire(resourceId, Math.max(0, waitMs - (Date.now() - startedAt)));
    } catch (error) {
      // Keep the chain intact: the waiters behind this one still wait for the real holder.
      void previous.then(release);
      this.cleanup(resourceId, tail);
      throw error;
    } finally {
      clearTimeout(timer);
    }

    return this.runHolding(resourceId, tail, release, task, releaseMachine);
  }

  /**
   * Runs the task right away, without waiting (a machine limited to one session keeps its immediate conflict),
   * but changes queued after it still wait for it. That keeps counts consistent while the limit is being raised.
   */
  async runAlongside<T>(resourceId: number, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(resourceId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const tail = Promise.all([previous, current]).then(() => undefined);
    this.tails.set(resourceId, tail);
    return this.runHolding(resourceId, tail, release, task);
  }

  private async runHolding<T>(
    resourceId: number,
    tail: Promise<void>,
    release: () => void,
    task: () => Promise<T>,
    releaseMachine?: () => Promise<void>,
  ): Promise<T> {
    try {
      return await task();
    } finally {
      await releaseMachine?.();
      release();
      this.cleanup(resourceId, tail);
    }
  }

  private cleanup(resourceId: number, tail: Promise<void>): void {
    void tail.then(() => {
      if (this.tails.get(resourceId) === tail) this.tails.delete(resourceId);
    });
  }
}

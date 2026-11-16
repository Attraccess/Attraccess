import { PLUGIN_BLE_LIMITS, PluginBleError, PluginBleNotification, PluginBleNotificationStream } from './plugin-ble';
import { resolveBleTimeout } from './plugin-ble-validation';

/** The clock a stream needs for `receivedAt` and `next()` timeouts. */
export interface BleStreamClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): () => void;
}

export function cancelledBleCall(operation: string): PluginBleError {
  return new PluginBleError('CANCELLED', `${operation} was cancelled`, { operation });
}

/** One subscription's bounded notification queue. @internal Part of the session engine. */
export class BleNotificationStream {
  private readonly queue: PluginBleNotification[] = [];
  private readonly waiters: Array<{ resolve(n: PluginBleNotification): void; reject(e: PluginBleError): void }> = [];
  private terminal: PluginBleError | null = null;
  /** What plugins get: no access to the queue, the capacity or the session. */
  readonly handle: PluginBleNotificationStream;

  constructor(
    private readonly key: string,
    private readonly capacity: number,
    private readonly clock: BleStreamClock,
    private readonly onUnsubscribe: () => Promise<void>,
  ) {
    this.handle = Object.freeze({
      next: (options?: { timeoutMs?: number; signal?: AbortSignal }) => this.take(options ?? {}, true),
      unsubscribe: () => this.unsubscribe(),
      [Symbol.asyncIterator]: () => this.iterator(),
    });
  }

  push(value: Uint8Array): void {
    if (this.terminal) return;
    const notification = { key: this.key, value, receivedAt: new Date(this.clock.now()) };
    const waiter = this.waiters.shift();
    if (waiter) return waiter.resolve(notification);
    if (this.queue.length >= this.capacity) {
      return this.end(
        new PluginBleError('NOTIFICATION_OVERFLOW', `Notification queue of "${this.key}" overflowed`, {
          operation: 'subscribe',
          detail: `capacity ${this.capacity}`,
        }),
      );
    }
    this.queue.push(notification);
  }

  /** Ends the stream with the error every pending and later `next()` rejects with. */
  end(error: PluginBleError): void {
    if (this.terminal) return;
    this.terminal = error;
    this.queue.length = 0;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  get ended(): boolean {
    return this.terminal !== null;
  }

  private take(
    options: { timeoutMs?: number; signal?: AbortSignal },
    useTimeout: boolean,
  ): Promise<PluginBleNotification> {
    try {
      const timeoutMs = useTimeout
        ? resolveBleTimeout(options.timeoutMs, PLUGIN_BLE_LIMITS.opTimeoutDefaultMs, PLUGIN_BLE_LIMITS.opTimeoutMaxMs)
        : 0;
      const queued = this.queue.shift();
      if (queued) return Promise.resolve(queued);
      if (this.terminal) return Promise.reject(this.terminal);
      if (options.signal?.aborted) return Promise.reject(cancelledBleCall('next'));
      return new Promise((resolve, reject) => {
        let cancelTimer: (() => void) | undefined;
        const cleanup = () => {
          cancelTimer?.();
          options.signal?.removeEventListener('abort', onAbort);
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
        };
        const waiter = {
          resolve: (n: PluginBleNotification) => (cleanup(), resolve(n)),
          reject: (e: PluginBleError) => (cleanup(), reject(e)),
        };
        const onAbort = () => waiter.reject(cancelledBleCall('next'));
        options.signal?.addEventListener('abort', onAbort, { once: true });
        if (useTimeout) {
          cancelTimer = this.clock.setTimeout(
            () =>
              waiter.reject(new PluginBleError('TIMEOUT', 'No notification arrived in time', { operation: 'next' })),
            timeoutMs,
          );
        }
        this.waiters.push(waiter);
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Tears down this stream only. A no-op once the stream has ended or the session is closed. */
  private unsubscribe(): Promise<void> {
    return this.ended ? Promise.resolve() : this.onUnsubscribe();
  }

  private iterator(): AsyncIterator<PluginBleNotification> {
    return {
      next: async () => {
        try {
          return { value: await this.take({}, false), done: false };
        } catch (error) {
          if (error instanceof PluginBleError && (error.code === 'CANCELLED' || error.code === 'SESSION_CLOSED')) {
            return { value: undefined, done: true };
          }
          throw error;
        }
      },
      return: async () => {
        await this.unsubscribe();
        return { value: undefined, done: true };
      },
    };
  }
}

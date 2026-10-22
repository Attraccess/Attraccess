import { Mutex } from 'async-mutex';
import { randomUUID } from 'node:crypto';
import { AuthenticatedWebSocket, AttractapEventType } from './websocket.types';

export const READER_DELIVERY_CANCELLED = 'Reader delivery cancelled';
export const READER_WORK_LIMIT = 8;
export const READER_DELIVERY_CAPACITY = 'Reader delivery capacity exceeded';

/** No queue: reserve synchronously before starting work or allocating a timer. */
export class ReaderWorkLimit {
  private readonly active = new WeakMap<object, number>();

  acquire(client: object): (() => void) | undefined {
    const count = this.active.get(client) ?? 0;
    if (count >= READER_WORK_LIMIT) return undefined;
    this.active.set(client, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.active.get(client) ?? 1) - 1;
      if (remaining) this.active.set(client, remaining);
      else this.active.delete(client);
    };
  }
}

/** ACKs and cancellation have different outcomes and belong to an exact socket. */
export class ReaderDeliveryAwaiters {
  readonly mutex = new Mutex();
  private readonly capacity = new ReaderWorkLimit();
  private pending: Array<{
    id: string;
    client: AuthenticatedWebSocket;
    type: AttractapEventType;
    acknowledge: () => void;
    cancel: () => void;
  }> = [];

  wait(client: AuthenticatedWebSocket, type: AttractapEventType, timeoutMs: number): Promise<void> {
    const release = this.capacity.acquire(client);
    if (!release) return Promise.reject(new Error(READER_DELIVERY_CAPACITY));
    const id = randomUUID();
    const remove = () => {
      this.pending = this.pending.filter((awaiter) => awaiter.id !== id);
      release();
    };
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        remove();
        reject(new Error(`Timeout waiting for client response of type ${type}`));
      }, timeoutMs);
      this.pending.push({
        id,
        client,
        type,
        acknowledge: () => {
          clearTimeout(timeout);
          resolve();
          remove();
        },
        cancel: () => {
          clearTimeout(timeout);
          reject(new Error(READER_DELIVERY_CANCELLED));
          remove();
        },
      });
    });
  }

  async acknowledge(client: AuthenticatedWebSocket, type: AttractapEventType): Promise<void> {
    await this.mutex.runExclusive(() => {
      const matching = this.pending.filter((awaiter) => awaiter.client === client && awaiter.type === type);
      matching.forEach((awaiter) => awaiter.acknowledge());
      const resolved = new Set(matching.map((awaiter) => awaiter.id));
      this.pending = this.pending.filter((awaiter) => !resolved.has(awaiter.id));
    });
  }

  cancel(client: AuthenticatedWebSocket): void {
    this.pending.filter((awaiter) => awaiter.client === client).forEach((awaiter) => awaiter.cancel());
  }
}

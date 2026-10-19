import { Mutex } from 'async-mutex';
import { randomUUID } from 'node:crypto';
import { AuthenticatedWebSocket, AttractapEventType } from './websocket.types';

export const READER_DELIVERY_CANCELLED = 'Reader delivery cancelled';

/** ACKs and cancellation have different outcomes and belong to an exact socket. */
export class ReaderDeliveryAwaiters {
  readonly mutex = new Mutex();
  private pending: Array<{
    id: string;
    client: AuthenticatedWebSocket;
    type: AttractapEventType;
    acknowledge: () => void;
    cancel: () => void;
  }> = [];

  wait(client: AuthenticatedWebSocket, type: AttractapEventType, timeoutMs: number): Promise<void> {
    const id = randomUUID();
    const remove = () =>
      this.mutex.runExclusive(() => {
        this.pending = this.pending.filter((awaiter) => awaiter.id !== id);
      });
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        void remove();
        reject(new Error(`Timeout waiting for client response of type ${type}`));
      }, timeoutMs);
      this.pending.push({
        id,
        client,
        type,
        acknowledge: () => {
          clearTimeout(timeout);
          resolve();
          void remove();
        },
        cancel: () => {
          clearTimeout(timeout);
          reject(new Error(READER_DELIVERY_CANCELLED));
          void remove();
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

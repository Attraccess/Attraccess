import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ClusterDeadlines } from './cluster.types';
import { valkeyCall } from './valkey-call';

/** Due items are noticed within this long, so expiries fire within about a second of their deadline. */
export const DEADLINE_SWEEP_EVERY_MS = 500;
const BATCH = 100;

const queueKey = (queue: string) => `attraccess:cluster:deadlines:${queue}`;

type Handler = (itemId: string) => Promise<void> | void;

class DeadlineHandlers {
  readonly logger = new Logger('ClusterDeadlines');
  readonly handlers = new Map<string, Handler>();

  onDue(queue: string, handler: Handler): void {
    this.handlers.set(queue, handler);
  }

  async fire(queue: string, itemId: string): Promise<void> {
    try {
      await this.handlers.get(queue)?.(itemId);
    } catch (error) {
      this.logger.error(`Deadline ${queue}/${itemId} failed: ${(error as Error).message}`);
    }
  }
}

/** One instance: a timer per item, as the features had before (fake timers in tests drive it). */
export class LocalClusterDeadlines implements ClusterDeadlines {
  private readonly due = new DeadlineHandlers();

  onDue(queue: string, handler: Handler): void {
    this.due.onDue(queue, handler);
  }

  private readonly timers = new Map<string, NodeJS.Timeout>();

  async schedule(queue: string, itemId: string, atMs: number): Promise<void> {
    this.clear(queue, itemId);
    const timer = setTimeout(
      () => {
        this.timers.delete(`${queue}/${itemId}`);
        void this.due.fire(queue, itemId);
      },
      Math.max(0, atMs - Date.now()),
    );
    // A pending deadline must not keep the process alive on shutdown.
    timer.unref?.();
    this.timers.set(`${queue}/${itemId}`, timer);
  }

  async cancel(queue: string, itemId: string): Promise<void> {
    this.clear(queue, itemId);
  }

  private clear(queue: string, itemId: string): void {
    clearTimeout(this.timers.get(`${queue}/${itemId}`));
    this.timers.delete(`${queue}/${itemId}`);
  }
}

/**
 * A sorted set per queue, scored by deadline, swept by every instance. Removing the item (`ZREM` answers 1 to one
 * caller only) is the claim, so each deadline fires on exactly one instance. No keyspace notifications needed.
 */
export class ValkeyClusterDeadlines implements ClusterDeadlines {
  private readonly due = new DeadlineHandlers();
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(private readonly client: Pick<Redis, 'status' | 'zadd' | 'zrem' | 'zrangebyscore'>) {}

  onDue(queue: string, handler: Handler): void {
    this.due.onDue(queue, handler);
  }

  start(everyMs = DEADLINE_SWEEP_EVERY_MS): void {
    this.timer = setInterval(() => void this.sweep(), everyMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async schedule(queue: string, itemId: string, atMs: number): Promise<void> {
    await valkeyCall(this.client, () => this.client.zadd(queueKey(queue), atMs, itemId));
  }

  async cancel(queue: string, itemId: string): Promise<void> {
    await valkeyCall(this.client, () => this.client.zrem(queueKey(queue), itemId)).catch(() => undefined);
  }

  /** Exposed for tests: fires every due item this instance wins. */
  async sweep(now = Date.now()): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (const queue of this.due.handlers.keys()) {
        let due: string[];
        try {
          due = await valkeyCall(this.client, () =>
            this.client.zrangebyscore(queueKey(queue), '-inf', now, 'LIMIT', 0, BATCH),
          );
        } catch {
          continue; // Valkey unreachable: the deadlines wait for it.
        }
        for (const itemId of due) {
          const won = await valkeyCall(this.client, () => this.client.zrem(queueKey(queue), itemId)).catch(() => 0);
          if (won === 1) await this.due.fire(queue, itemId);
        }
      }
    } finally {
      this.sweeping = false;
    }
  }
}

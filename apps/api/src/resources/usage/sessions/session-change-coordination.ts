import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { MachineBusyError } from '../errors/machine-busy.error';

/** Another API instance may be running a change for the same machine, so Valkey holds the machine lock. */
const LOCK_TTL_MS = 15_000;
const RENEW_EVERY_MS = 5_000;
const RETRY_EVERY_MS = 50;

const lockKey = (resourceId: number) => `attraccess:session-change:lock:${resourceId}`;
const aliveKey = (attemptId: string) => `attraccess:session-change:alive:${attemptId}`;

/** Compare-and-extend / compare-and-delete: only the holder that set the token may touch the key. */
export const RENEW_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
export const RELEASE_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export type ReleaseLock = () => Promise<void>;

/**
 * What makes the per-machine serialization of session changes hold across API instances, and what tells a
 * restarting instance which unfinished lifecycle attempts belong to a live change on another instance.
 */
export interface SessionChangeCoordination {
  /** Waits up to `timeoutMs` for the machine, then throws `MachineBusyError`. */
  acquire(resourceId: number, timeoutMs: number): Promise<ReleaseLock>;
  /** Marks a lifecycle attempt as being worked on until the returned function is called. */
  keepAlive(attemptId: string): () => void;
  /** False when no instance is working on the attempt any more (crashed or restarted). */
  isAlive(attemptId: string): Promise<boolean>;
}

/** One API instance: the in-process queue is the whole story and every attempt left at boot is an orphan. */
export class LocalSessionChangeCoordination implements SessionChangeCoordination {
  private readonly alive = new Set<string>();

  async acquire(): Promise<ReleaseLock> {
    return async () => undefined;
  }

  keepAlive(attemptId: string): () => void {
    this.alive.add(attemptId);
    return () => void this.alive.delete(attemptId);
  }

  async isAlive(attemptId: string): Promise<boolean> {
    return this.alive.has(attemptId);
  }
}

/**
 * Valkey-backed coordination. Valkey is optional and not required for using a machine, so an unreachable
 * Valkey degrades to the in-process queue (logged) instead of blocking every start and stop.
 */
export class ValkeySessionChangeCoordination implements SessionChangeCoordination {
  private readonly logger = new Logger(ValkeySessionChangeCoordination.name);
  private readonly local = new LocalSessionChangeCoordination();

  constructor(private readonly client: Pick<Redis, 'set' | 'eval' | 'exists' | 'del'>) {}

  async acquire(resourceId: number, timeoutMs: number): Promise<ReleaseLock> {
    const key = lockKey(resourceId);
    const token = randomUUID();
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let acquired: unknown;
      try {
        acquired = await this.client.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
      } catch (error) {
        this.logger.warn(`Valkey lock unavailable, serializing in this instance only: ${(error as Error).message}`);
        return async () => undefined;
      }
      if (acquired === 'OK') break;
      if (Date.now() >= deadline) throw new MachineBusyError();
      await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_EVERY_MS, Math.max(1, deadline - Date.now()))));
    }
    const renew = setInterval(() => {
      void this.client.eval(RENEW_LOCK_SCRIPT, 1, key, token, LOCK_TTL_MS).catch(() => undefined);
    }, RENEW_EVERY_MS);
    renew.unref?.();
    return async () => {
      clearInterval(renew);
      await this.client.eval(RELEASE_LOCK_SCRIPT, 1, key, token).catch(() => undefined);
    };
  }

  keepAlive(attemptId: string): () => void {
    const stopLocal = this.local.keepAlive(attemptId);
    const key = aliveKey(attemptId);
    const mark = () => void this.client.set(key, '1', 'PX', LOCK_TTL_MS).catch(() => undefined);
    mark();
    const renew = setInterval(mark, RENEW_EVERY_MS);
    renew.unref?.();
    return () => {
      clearInterval(renew);
      stopLocal();
      void this.client.del(key).catch(() => undefined);
    };
  }

  async isAlive(attemptId: string): Promise<boolean> {
    if (await this.local.isAlive(attemptId)) return true;
    try {
      return (await this.client.exists(aliveKey(attemptId))) > 0;
    } catch {
      return false;
    }
  }
}

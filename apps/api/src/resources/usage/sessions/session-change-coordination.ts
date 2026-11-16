import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { Redis } from 'ioredis';
import { MachineBusyError } from '../errors/machine-busy.error';

/** Another API instance may be running a change for the same machine, so Valkey holds the machine lock. */
export const LOCK_TTL_MS = 15_000;
const RENEW_EVERY_MS = 5_000;
/** Longer than the renewal interval: a live change has renewed its heartbeat between two sweeps. */
export const SWEEP_EVERY_MS = 7_500;
const RETRY_EVERY_MS = 50;
/** A Valkey call that takes longer counts as failed, so a stalled Valkey never holds up starts and stops. */
export const COMMAND_TIMEOUT_MS = 1_000;
/** A heartbeat missing for this long has missed a renewal: its owner is gone. */
const MISSING_FOR_MS = RENEW_EVERY_MS + COMMAND_TIMEOUT_MS;
/** How long a booting instance waits for an unreachable Valkey before it cleans up as if it were alone. */
export const BOOT_VALKEY_WAIT_MS = 10_000;

const lockKey = (resourceId: number) => `attraccess:session-change:lock:${resourceId}`;
const aliveKey = (attemptId: string) => `attraccess:session-change:alive:${attemptId}`;

/**
 * Extends the holder's lock. A lock that vanished (Valkey restarted without its data) is set again unless
 * another instance took it meanwhile; 0 means the lock now belongs to somebody else.
 */
export const RENEW_LOCK_SCRIPT = `local v = redis.call('get', KEYS[1])
if v == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end
if not v then redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 1 end
return 0`;
/** Compare-and-delete: only the holder that set the token may release the lock. */
export const RELEASE_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export type ReleaseLock = () => Promise<void>;

/**
 * What makes the per-machine serialization of session changes hold across API instances, and what tells an
 * instance which unfinished lifecycle attempts no instance is working on any more.
 */
export interface SessionChangeCoordination {
  /** Waits up to `timeoutMs` for the machine, then throws `MachineBusyError`. */
  acquire(resourceId: number, timeoutMs: number): Promise<ReleaseLock>;
  /** Marks a lifecycle attempt as being worked on until the returned function is called. */
  keepAlive(attemptId: string): () => void;
  /**
   * The given attempts that no instance is working on any more (crashed or restarted). `atBoot`: called once
   * while this instance starts. While Valkey cannot be asked, a sweep returns none; boot waits for it a little,
   * then returns every attempt this instance is not running, as an instance without Valkey would.
   */
  findGone(attemptIds: string[], atBoot: boolean): Promise<Set<string>>;
}

/** One API instance: the in-process queue is the whole story and every attempt it is not running is gone. */
export class LocalSessionChangeCoordination implements SessionChangeCoordination {
  private readonly alive = new Set<string>();

  async acquire(): Promise<ReleaseLock> {
    return async () => undefined;
  }

  keepAlive(attemptId: string): () => void {
    this.alive.add(attemptId);
    return () => void this.alive.delete(attemptId);
  }

  isWorkingOn(attemptId: string): boolean {
    return this.alive.has(attemptId);
  }

  async findGone(attemptIds: string[]): Promise<Set<string>> {
    return new Set(attemptIds.filter((id) => !this.alive.has(id)));
  }
}

/** Stable across restarts of the same instance, distinct between instances running at the same time. */
export function defaultInstanceName(): string {
  return `${hostname()}:${process.env.PORT ?? '3000'}`;
}

type ValkeyClient = Pick<Redis, 'set' | 'get' | 'eval' | 'mget' | 'del'> & { status?: string };
const OFFLINE = new Set(['reconnecting', 'close', 'end']);

/**
 * Valkey-backed coordination. Valkey is optional and not required for using a machine, so an unreachable
 * Valkey degrades to the in-process queue (logged) instead of blocking every start and stop.
 *
 * Heartbeats and lock tokens start with `<instance name>|<boot id>`, so an instance that restarts quickly
 * recognises the attempts and locks of its previous run right away instead of waiting for them to expire.
 */
export class ValkeySessionChangeCoordination implements SessionChangeCoordination {
  private readonly logger = new Logger(ValkeySessionChangeCoordination.name);
  private readonly local = new LocalSessionChangeCoordination();
  private readonly heartbeat: string;
  /** When a sweep first found an attempt's heartbeat missing; gone once it has stayed missing long enough. */
  private suspects = new Map<string, number>();

  constructor(
    private readonly client: ValkeyClient,
    private readonly instanceName = defaultInstanceName(),
    private readonly bootWaitMs = BOOT_VALKEY_WAIT_MS,
  ) {
    this.heartbeat = `${instanceName}|${randomUUID()}`;
  }

  async acquire(resourceId: number, timeoutMs: number): Promise<ReleaseLock> {
    const key = lockKey(resourceId);
    const token = `${this.heartbeat}#${randomUUID()}`;
    const deadline = Date.now() + timeoutMs;
    let heldElsewhere = false;
    let checkHolder = true;
    for (;;) {
      try {
        if ((await this.call(() => this.client.set(key, token, 'PX', LOCK_TTL_MS, 'NX'))) === 'OK') break;
        heldElsewhere = true;
        if (checkHolder) {
          checkHolder = false;
          const holder = await this.call(() => this.client.get(key));
          // An earlier SET of ours that timed out may have landed after all.
          if (holder === token) break;
          if (await this.releaseIfFromPreviousRun(key, holder)) continue;
        }
      } catch (error) {
        // Once another instance is known to hold the machine, keep waiting for it rather than run alongside.
        if (!heldElsewhere) {
          this.logger.warn(`Valkey lock unavailable, serializing in this instance only: ${(error as Error).message}`);
          void this.call(() => this.client.eval(RELEASE_LOCK_SCRIPT, 1, key, token)).catch(() => undefined);
          return async () => undefined;
        }
        checkHolder = true;
      }
      if (Date.now() >= deadline) throw new MachineBusyError();
      await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_EVERY_MS, Math.max(1, deadline - Date.now()))));
    }
    return this.hold(key, token);
  }

  keepAlive(attemptId: string): () => void {
    const stopLocal = this.local.keepAlive(attemptId);
    const key = aliveKey(attemptId);
    const report = this.reportOnce(`Marking session change ${attemptId} as alive failed`);
    const mark = () =>
      void this.call(() => this.client.set(key, this.heartbeat, 'PX', LOCK_TTL_MS)).then(() => report(), report);
    mark();
    const renew = setInterval(mark, RENEW_EVERY_MS);
    renew.unref?.();
    return () => {
      clearInterval(renew);
      stopLocal();
      void this.call(() => this.client.del(key)).catch(() => undefined);
    };
  }

  async findGone(attemptIds: string[], atBoot: boolean): Promise<Set<string>> {
    const candidates = attemptIds.filter((id) => !this.local.isWorkingOn(id));
    const heartbeats = candidates.length > 0 ? await this.readHeartbeats(candidates, atBoot) : [];
    if (!heartbeats) return new Set(atBoot ? candidates : []);
    const now = Date.now();
    const gone = new Set<string>();
    const missing = new Map<string, number>();
    candidates.forEach((id, index) => {
      const beat = heartbeats[index];
      if (beat === null) {
        // Missing at boot: nobody renews it. Missing in a sweep: only once it has stayed missing past a renewal,
        // so a heartbeat lost with Valkey's data is renewed by its live owner before it counts as gone.
        const since = atBoot ? 0 : (this.suspects.get(id) ?? now);
        if (now - since >= MISSING_FOR_MS) gone.add(id);
        else missing.set(id, since);
      } else if (beat.startsWith(`${this.instanceName}|`) && beat !== this.heartbeat) gone.add(id);
    });
    if (!atBoot) this.suspects = missing;
    return gone;
  }

  /** Undefined when Valkey cannot be asked; at boot after waiting for it a little. */
  private async readHeartbeats(ids: string[], atBoot: boolean): Promise<(string | null)[] | undefined> {
    const deadline = Date.now() + (atBoot ? this.bootWaitMs : 0);
    for (;;) {
      try {
        return await this.call(() => this.client.mget(...ids.map(aliveKey)));
      } catch (error) {
        if (Date.now() >= deadline) {
          this.logger.warn(
            atBoot
              ? `Valkey unreachable at boot, cancelling unfinished session changes as the only instance: ${(error as Error).message}`
              : `Cannot check unfinished session changes, leaving them for now: ${(error as Error).message}`,
          );
          return undefined;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, Math.max(1, deadline - Date.now()))));
      }
    }
  }

  /** A lock left by this instance's previous run (it crashed and restarted quickly) is released at once. */
  private async releaseIfFromPreviousRun(key: string, holder: string | null): Promise<boolean> {
    if (!holder?.startsWith(`${this.instanceName}|`) || holder.startsWith(`${this.heartbeat}#`)) return false;
    return (await this.call(() => this.client.eval(RELEASE_LOCK_SCRIPT, 1, key, holder))) === 1;
  }

  private hold(key: string, token: string): ReleaseLock {
    const report = this.reportOnce(`Renewing the session-change lock ${key} failed`);
    const renew = setInterval(() => {
      this.call(() => this.client.eval(RENEW_LOCK_SCRIPT, 1, key, token, LOCK_TTL_MS)).then(
        (result) => report(result === 0 ? new Error('another instance holds it now') : undefined),
        report,
      );
    }, RENEW_EVERY_MS);
    renew.unref?.();
    return async () => {
      clearInterval(renew);
      await this.call(() => this.client.eval(RELEASE_LOCK_SCRIPT, 1, key, token)).catch(() => undefined);
    };
  }

  /** Logs the first failure of a repeated call, and again after it has worked in between. */
  private reportOnce(what: string): (error?: unknown) => void {
    let failing = false;
    return (error) => {
      if (error && !failing) this.logger.error(`${what}: ${(error as Error).message}`);
      failing = Boolean(error);
    };
  }

  private call<T>(command: () => Promise<T>): Promise<T> {
    // While the client reconnects it would queue the command; answer at once instead.
    const { status } = this.client;
    if (status && OFFLINE.has(status)) return Promise.reject(new Error(`Valkey is ${status}`));
    let timer: NodeJS.Timeout | undefined;
    return Promise.race([
      command(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Valkey did not answer in time')), COMMAND_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]).finally(() => clearTimeout(timer));
  }
}

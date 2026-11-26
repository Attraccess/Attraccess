import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { resolveInstanceName } from '../resources/usage/sessions/session-change-coordination';
import type { ClusterInstances } from './cluster.types';
import { valkeyCall } from './valkey-call';

/**
 * An instance whose heartbeat is older than this is gone: other instances drop its readers and the requests it
 * held. A crash is noticed within about this long plus one sweep.
 */
export const INSTANCE_TTL_MS = 15_000;
export const HEARTBEAT_EVERY_MS = 5_000;
export const SWEEP_EVERY_MS = 2_000;
const REAP_CLAIM_TTL_MS = 60_000;

const INSTANCES_KEY = 'attraccess:cluster:instances';
const aliveKey = (id: string) => `attraccess:cluster:alive:${id}`;
const reapKey = (id: string) => `attraccess:cluster:reap:${id}`;

export function newInstanceId(name = resolveInstanceName()): string {
  return `${name}|${randomUUID()}`;
}

/** One instance alone: it is always alive and never sees another one go. */
export class LocalClusterInstances implements ClusterInstances {
  constructor(readonly id = newInstanceId()) {}

  async live(): Promise<string[]> {
    return [this.id];
  }

  async isAlive(instanceId: string): Promise<boolean> {
    return instanceId === this.id;
  }

  onGone(): void {
    // Nothing else can go.
  }
}

type InstancesClient = Pick<Redis, 'status' | 'set' | 'zadd' | 'zrange' | 'zrem' | 'mget' | 'exists' | 'del'>;

/** Heartbeats in Valkey: `alive:<id>` with a TTL, and the set of instances that ever beat (to find gone ones). */
export class ValkeyClusterInstances implements ClusterInstances {
  private readonly logger = new Logger('ClusterInstances');
  private readonly goneHandlers: Array<(instanceId: string) => Promise<void> | void> = [];
  private suspects = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];
  private failing = false;

  constructor(
    private readonly client: InstancesClient,
    readonly id = newInstanceId(),
    private readonly timing = { heartbeatEveryMs: HEARTBEAT_EVERY_MS, sweepEveryMs: SWEEP_EVERY_MS },
  ) {}

  /** Beats at once, then on an interval, and sweeps for gone instances. */
  start(): void {
    void this.beat();
    const beat = setInterval(() => void this.beat(), this.timing.heartbeatEveryMs);
    const sweep = setInterval(() => void this.sweep(), this.timing.sweepEveryMs);
    beat.unref?.();
    sweep.unref?.();
    this.timers = [beat, sweep];
  }

  /** Stops beating. The heartbeat is deleted, so the others clean up after this instance right away. */
  async stop(): Promise<void> {
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers = [];
    await valkeyCall(this.client, () => this.client.del(aliveKey(this.id))).catch(() => undefined);
  }

  /** Stops beating without a word, as a crash would (tests). */
  halt(): void {
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers = [];
  }

  onGone(handler: (instanceId: string) => Promise<void> | void): void {
    this.goneHandlers.push(handler);
  }

  async isAlive(instanceId: string): Promise<boolean> {
    if (instanceId === this.id) return true;
    return (await valkeyCall(this.client, () => this.client.exists(aliveKey(instanceId)))) === 1;
  }

  async live(): Promise<string[]> {
    const ids = await valkeyCall(this.client, () => this.client.zrange(INSTANCES_KEY, '0', '-1'));
    if (ids.length === 0) return [this.id];
    const beats = await valkeyCall(this.client, () => this.client.mget(...ids.map(aliveKey)));
    const alive = ids.filter((id, index) => beats[index] !== null || id === this.id);
    return alive.includes(this.id) ? alive : [...alive, this.id];
  }

  /** Exposed for tests: one beat. */
  async beat(): Promise<void> {
    try {
      await valkeyCall(this.client, () =>
        this.client.set(aliveKey(this.id), String(Date.now()), 'PX', INSTANCE_TTL_MS),
      );
      await valkeyCall(this.client, () => this.client.zadd(INSTANCES_KEY, Date.now(), this.id));
      if (this.failing) this.logger.log('Cluster heartbeat works again');
      this.failing = false;
    } catch (error) {
      if (!this.failing) this.logger.warn(`Cluster heartbeat failed: ${(error as Error).message}`);
      this.failing = true;
    }
  }

  /** Exposed for tests: one sweep. Gone instances are cleaned up by exactly one instance (`reap:<id>` NX). */
  async sweep(): Promise<void> {
    let ids: string[];
    let beats: (string | null)[];
    try {
      ids = (await valkeyCall(this.client, () => this.client.zrange(INSTANCES_KEY, '0', '-1'))).filter(
        (id) => id !== this.id,
      );
      if (ids.length === 0) return;
      beats = await valkeyCall(this.client, () => this.client.mget(...ids.map(aliveKey)));
    } catch {
      return; // Valkey unreachable: nobody can be judged gone now.
    }
    const now = Date.now();
    const missing = new Map<string, number>();
    for (const [index, id] of ids.entries()) {
      if (beats[index] !== null) continue;
      const since = this.suspects.get(id) ?? now;
      // Missing for longer than a renewal: Valkey did not just lose it with its data.
      if (now - since >= this.timing.heartbeatEveryMs + 1_000) await this.reap(id);
      else missing.set(id, since);
    }
    this.suspects = missing;
  }

  private async reap(instanceId: string): Promise<void> {
    try {
      const claimed = await valkeyCall(this.client, () =>
        this.client.set(reapKey(instanceId), this.id, 'PX', REAP_CLAIM_TTL_MS, 'NX'),
      );
      if (claimed !== 'OK') return;
      this.logger.log(`Instance ${instanceId} stopped beating; cleaning up after it`);
      for (const handler of this.goneHandlers) {
        try {
          await handler(instanceId);
        } catch (error) {
          this.logger.error(`Cleaning up after instance ${instanceId} failed: ${(error as Error).message}`);
        }
      }
      await valkeyCall(this.client, () => this.client.zrem(INSTANCES_KEY, instanceId));
    } catch (error) {
      this.logger.warn(`Could not clean up after instance ${instanceId}: ${(error as Error).message}`);
    }
  }
}

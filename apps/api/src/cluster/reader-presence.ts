import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ClusterBus, ClusterInstances, ReaderHolder, ReaderPresence } from './cluster.types';
import { valkeyCall } from './valkey-call';

const readerKey = (readerId: number) => `attraccess:cluster:reader:${readerId}`;
const instanceReadersKey = (instanceId: string) => `attraccess:cluster:instance-readers:${instanceId}`;
const CONNECTED_MESSAGE = 'reader.connected';

/** The sockets this instance holds per reader, with the time each signed in. */
class LocalHoldings {
  readonly readers = new Map<number, Map<string, number>>();

  add(readerId: number, socketId: string): number {
    const sockets = this.readers.get(readerId) ?? new Map<string, number>();
    const at = Date.now();
    sockets.set(socketId, at);
    this.readers.set(readerId, sockets);
    return at;
  }

  /** The newest remaining connection, or null when this instance no longer holds the reader. */
  remove(readerId: number, socketId: string): number | null {
    const sockets = this.readers.get(readerId);
    sockets?.delete(socketId);
    if (!sockets || sockets.size === 0) {
      this.readers.delete(readerId);
      return null;
    }
    return Math.max(...sockets.values());
  }

  newest(readerId: number): number | null {
    const sockets = this.readers.get(readerId);
    return sockets && sockets.size > 0 ? Math.max(...sockets.values()) : null;
  }
}

/** One instance: it holds the readers whose sockets it has, and nobody else holds any. */
export class LocalReaderPresence implements ReaderPresence {
  private readonly local = new LocalHoldings();
  private readonly connectedHandlers: Array<(readerId: number, instanceId: string) => void> = [];

  constructor(private readonly instanceId: string) {}

  socketConnected(readerId: number, socketId: string): void {
    this.local.add(readerId, socketId);
    this.connectedHandlers.forEach((handler) => handler(readerId, this.instanceId));
  }

  socketDisconnected(readerId: number, socketId: string): void {
    this.local.remove(readerId, socketId);
  }

  async holders(readerId: number): Promise<ReaderHolder[]> {
    const newest = this.local.newest(readerId);
    return newest === null ? [] : [{ instanceId: this.instanceId, connectedAt: newest }];
  }

  onReaderLost(): void {
    // Without other instances a reader is only lost through its own socket closing.
  }

  onReaderConnected(handler: (readerId: number, instanceId: string) => void): void {
    this.connectedHandlers.push(handler);
  }
}

type PresenceClient = Pick<
  Redis,
  'status' | 'hset' | 'hdel' | 'hgetall' | 'sadd' | 'srem' | 'smembers' | 'del' | 'mget'
>;

/**
 * Presence in Valkey: `reader:<id>` maps holding instances to their newest connection, and `instance-readers:<id>`
 * lists what an instance holds so a survivor can drop it when the instance is gone. Holders whose heartbeat lapsed
 * are never reported. Every heartbeat writes this instance's holdings again, so Valkey losing its data heals.
 */
export class ValkeyReaderPresence implements ReaderPresence {
  private readonly logger = new Logger('ReaderPresence');
  private readonly local = new LocalHoldings();
  private readonly lostHandlers: Array<(readerId: number) => Promise<void> | void> = [];
  private readonly connectedHandlers: Array<(readerId: number, instanceId: string) => void> = [];

  constructor(
    private readonly client: PresenceClient,
    private readonly instances: ClusterInstances,
    private readonly bus: ClusterBus,
  ) {
    instances.onGone((instanceId) => this.reapInstance(instanceId));
    bus.on(CONNECTED_MESSAGE, (payload, from) => {
      const { readerId } = payload as { readerId: number };
      this.connectedHandlers.forEach((handler) => handler(readerId, from));
    });
  }

  socketConnected(readerId: number, socketId: string): void {
    const at = this.local.add(readerId, socketId);
    void this.write(readerId, at);
    this.connectedHandlers.forEach((handler) => handler(readerId, this.instances.id));
    void this.bus.broadcast(CONNECTED_MESSAGE, { readerId });
  }

  socketDisconnected(readerId: number, socketId: string): void {
    const newest = this.local.remove(readerId, socketId);
    if (newest !== null) {
      void this.write(readerId, newest);
      return;
    }
    void valkeyCall(this.client, async () => {
      await this.client.hdel(readerKey(readerId), this.instances.id);
      await this.client.srem(instanceReadersKey(this.instances.id), String(readerId));
    }).catch((error) => this.logger.warn(`Could not record reader ${readerId} as gone: ${(error as Error).message}`));
  }

  async holders(readerId: number): Promise<ReaderHolder[]> {
    const local = this.local.newest(readerId);
    const entries = Object.entries(await valkeyCall(this.client, () => this.client.hgetall(readerKey(readerId))));
    const remote = entries.filter(([instanceId]) => instanceId !== this.instances.id);
    const beats =
      remote.length > 0
        ? await valkeyCall(this.client, () =>
            this.client.mget(...remote.map(([instanceId]) => `attraccess:cluster:alive:${instanceId}`)),
          )
        : [];
    const holders: ReaderHolder[] = remote
      .filter((_, index) => beats[index] !== null)
      .map(([instanceId, at]) => ({ instanceId, connectedAt: Number(at) }));
    if (local !== null) holders.push({ instanceId: this.instances.id, connectedAt: local });
    return holders.sort((a, b) => b.connectedAt - a.connectedAt);
  }

  onReaderLost(handler: (readerId: number) => Promise<void> | void): void {
    this.lostHandlers.push(handler);
  }

  onReaderConnected(handler: (readerId: number, instanceId: string) => void): void {
    this.connectedHandlers.push(handler);
  }

  /** Writes every reader this instance holds again (each heartbeat). */
  async resync(): Promise<void> {
    for (const [readerId] of this.local.readers) {
      const newest = this.local.newest(readerId);
      if (newest !== null) await this.write(readerId, newest);
    }
  }

  /** A gone instance's readers are dropped; those nobody else holds count as lost. */
  async reapInstance(instanceId: string): Promise<void> {
    const readerIds = (await valkeyCall(this.client, () => this.client.smembers(instanceReadersKey(instanceId)))).map(
      Number,
    );
    for (const readerId of readerIds) {
      await valkeyCall(this.client, () => this.client.hdel(readerKey(readerId), instanceId));
      if ((await this.holders(readerId)).length > 0) continue;
      for (const handler of this.lostHandlers) {
        try {
          await handler(readerId);
        } catch (error) {
          this.logger.error(`Cleaning up lost reader ${readerId} failed: ${(error as Error).message}`);
        }
      }
    }
    await valkeyCall(this.client, () => this.client.del(instanceReadersKey(instanceId)));
  }

  private async write(readerId: number, connectedAt: number): Promise<void> {
    try {
      await valkeyCall(this.client, async () => {
        await this.client.hset(readerKey(readerId), this.instances.id, String(connectedAt));
        await this.client.sadd(instanceReadersKey(this.instances.id), String(readerId));
      });
    } catch (error) {
      this.logger.warn(`Could not record reader ${readerId} as connected: ${(error as Error).message}`);
    }
  }
}

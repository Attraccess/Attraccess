import type { ClusterBus } from '../../../../cluster/cluster.types';
import type { BleTransportDriver, BleWatchState } from '../../../../plugin-system/ble/ble-transport-driver';
import { BleClusterMessage, decodeWatchEvent, type WireWatchEvent } from './ble-cluster-wire';

type WatchRequest = Parameters<NonNullable<BleTransportDriver['setWatch']>>[0];

interface OriginWatch {
  request: WatchRequest;
  /** Where this instance's part of the reader's set lives; null while nobody holds the reader. */
  holder: string | null;
  /** Bumped whenever the holder is decided, so a slower lookup cannot override a newer decision. */
  version: number;
}

/**
 * The origin's side of the advertisement watch (ATT-1163): this instance's wanted set per reader goes to the
 * instance holding the reader (`ClusterBleWatchMerger` there, this one included), and comes along when the reader
 * signs in elsewhere. State and events are accepted from that holder only; while nobody holds the reader it is
 * `offline`.
 */
export class ClusterBleWatchOrigin {
  private readonly watches = new Map<number, OriginWatch>();

  constructor(
    private readonly bus: ClusterBus,
    private readonly holderOf: (readerId: number) => Promise<string | null>,
  ) {
    bus.on(BleClusterMessage.WATCH_STATE, (payload, from) => {
      const { readerId, state } = payload as { readerId: number; state: BleWatchState };
      const entry = this.watches.get(readerId);
      if (entry?.holder === from) entry.request.listener.onWatchState(readerId, state);
    });
    bus.on(BleClusterMessage.WATCH_EVENTS, (payload, from) => {
      const { readerId, events } = payload as { readerId: number; events: WireWatchEvent[] };
      const entry = this.watches.get(readerId);
      if (entry?.holder === from) entry.request.listener.onWatchEvents(readerId, events.map(decodeWatchEvent));
    });
  }

  set(request: WatchRequest): void {
    const { readerId } = request;
    const existing = this.watches.get(readerId);
    if (request.filters.length === 0) {
      this.watches.delete(readerId);
      if (existing?.holder) this.sendPart(existing.holder, request);
      return;
    }
    const entry = existing ?? { request, holder: null, version: 0 };
    entry.request = request;
    this.watches.set(readerId, entry);
    if (entry.holder) this.sendPart(entry.holder, request);
    else void this.route(readerId);
  }

  /** The reader signed in on `instanceId`: the set moves there (the reader dropped its old connection). */
  readerConnected(readerId: number, instanceId: string): void {
    const entry = this.watches.get(readerId);
    if (!entry) return;
    if (entry.holder && entry.holder !== instanceId) this.sendPart(entry.holder, { ...entry.request, filters: [] });
    entry.holder = instanceId;
    entry.version++;
    this.sendPart(instanceId, entry.request);
  }

  /** The holders this instance's parts live on. */
  holders(): Set<string> {
    return new Set([...this.watches.values()].flatMap((entry) => (entry.holder ? [entry.holder] : [])));
  }

  /** The holder is gone without a word: its readers are offline until another instance holds them. */
  holderGone(holder: string): void {
    for (const [readerId, entry] of this.watches) {
      if (entry.holder !== holder) continue;
      entry.holder = null;
      entry.request.listener.onWatchState(readerId, { status: 'offline' });
      void this.route(readerId);
    }
  }

  private async route(readerId: number): Promise<void> {
    const entry = this.watches.get(readerId);
    if (!entry) return;
    const version = ++entry.version;
    const holder = await this.holderOf(readerId).catch(() => null);
    if (this.watches.get(readerId) !== entry || entry.version !== version) return;
    if (!holder) return entry.request.listener.onWatchState(readerId, { status: 'offline' });
    entry.holder = holder;
    this.sendPart(holder, entry.request);
  }

  private sendPart(holder: string, request: WatchRequest): void {
    const { readerId, filters, keepaliveMs } = request;
    void this.bus.send(holder, BleClusterMessage.WATCH_PART, { readerId, filters, keepaliveMs });
  }
}

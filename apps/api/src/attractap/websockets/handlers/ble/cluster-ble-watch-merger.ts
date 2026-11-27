import type { ClusterBus } from '../../../../cluster/cluster.types';
import type {
  BleTransportDriver,
  BleWatchDriverEvent,
  BleWatchFilter,
  BleWatchListener,
  BleWatchState,
} from '../../../../plugin-system/ble/ble-transport-driver';
import { BleClusterMessage, encodeWatchEvent } from './ble-cluster-wire';

type WatchRequest = Parameters<NonNullable<BleTransportDriver['setWatch']>>[0];

interface Part {
  filters: BleWatchFilter[];
  keepaliveMs: number;
}

interface Owner {
  origin: string;
  originId: number;
}

/** The merged watch set of one reader held here. */
interface MergedReader {
  parts: Map<string, Part>;
  /** Merged id per canonical filter: kept while the filter stays in the set. */
  idsByKey: Map<string, number>;
  nextId: number;
  owners: Map<number, Owner[]>;
  /** The merged set as last pushed to the reader. */
  sentKey: string | null;
  state: BleWatchState | null;
  listener: BleWatchListener;
}

const MAX_FILTER_ID = 0xffff;

const filterKey = (filter: BleWatchFilter) =>
  JSON.stringify([filter.serviceUuids, filter.manufacturerIds, filter.namePrefix ?? null]);

/**
 * The holder's side of the advertisement watch (ATT-1163). Every instance's watch manager sends its own filter set
 * per reader, with ids it chose; the reader takes one set. This merges the sets of all origins (equal filters
 * become one, ids are renumbered per reader), pushes the merged set through the local `ReaderBleWatch`, and reports
 * state and events back to each origin with that origin's own ids.
 */
export class ClusterBleWatchMerger {
  private readonly readers = new Map<number, MergedReader>();

  constructor(
    private readonly bus: ClusterBus,
    private readonly setLocal: (request: WatchRequest) => void,
  ) {
    bus.on(BleClusterMessage.WATCH_PART, (payload, from) => {
      const { readerId, filters, keepaliveMs } = payload as {
        readerId: number;
        filters: BleWatchFilter[];
        keepaliveMs: number;
      };
      this.setPart(from, readerId, { filters, keepaliveMs });
    });
  }

  /** The origins with a part in some reader's set. */
  origins(): Set<string> {
    return new Set([...this.readers.values()].flatMap((reader) => [...reader.parts.keys()]));
  }

  /** The origin is gone: its parts leave every set. */
  dropOrigin(origin: string): void {
    for (const [readerId, reader] of [...this.readers]) {
      const part = reader.parts.get(origin);
      if (part) this.setPart(origin, readerId, { filters: [], keepaliveMs: part.keepaliveMs });
    }
  }

  setPart(origin: string, readerId: number, part: Part): void {
    const reader = this.readers.get(readerId) ?? this.newReader(readerId);
    if (part.filters.length > 0) reader.parts.set(origin, part);
    else reader.parts.delete(origin);
    const filters = this.merge(reader);
    const keepaliveMs = Math.min(part.keepaliveMs, ...[...reader.parts.values()].map((entry) => entry.keepaliveMs));
    if (reader.parts.size === 0) {
      this.readers.delete(readerId);
      this.setLocal({ readerId, filters: [], keepaliveMs, listener: reader.listener });
      return;
    }
    const sentKey = JSON.stringify([filters, keepaliveMs]);
    if (sentKey === reader.sentKey && reader.state) {
      // Nothing changed for the reader (an origin re-sent its set): the origin still gets the state once.
      if (part.filters.length > 0) this.sendState(readerId, reader, origin, reader.state);
      return;
    }
    reader.sentKey = sentKey;
    this.setLocal({ readerId, filters, keepaliveMs, listener: reader.listener });
  }

  private newReader(readerId: number): MergedReader {
    const reader: MergedReader = {
      parts: new Map(),
      idsByKey: new Map(),
      nextId: 1,
      owners: new Map(),
      sentKey: null,
      state: null,
      listener: {
        onWatchState: (_readerId, state) => this.onState(readerId, state),
        onWatchEvents: (_readerId, events) => this.onEvents(readerId, events),
      },
    };
    this.readers.set(readerId, reader);
    return reader;
  }

  /** The union of all parts, equal filters once, in the order the origins sent them. */
  private merge(reader: MergedReader): BleWatchFilter[] {
    const merged = new Map<string, BleWatchFilter>();
    const owners = new Map<number, Owner[]>();
    for (const [origin, part] of reader.parts) {
      for (const filter of part.filters) {
        const key = filterKey(filter);
        let entry = merged.get(key);
        if (!entry) {
          const id = reader.idsByKey.get(key) ?? this.allocateId(reader);
          reader.idsByKey.set(key, id);
          entry = { id, serviceUuids: [...filter.serviceUuids], manufacturerIds: [...filter.manufacturerIds] };
          if (filter.namePrefix !== undefined) entry.namePrefix = filter.namePrefix;
          merged.set(key, entry);
        }
        owners.set(entry.id, [...(owners.get(entry.id) ?? []), { origin, originId: filter.id }]);
      }
    }
    for (const key of [...reader.idsByKey.keys()]) if (!merged.has(key)) reader.idsByKey.delete(key);
    reader.owners = owners;
    return [...merged.values()];
  }

  /** Ids are not reused right away, so a late event of a replaced filter cannot reach the new one. */
  private allocateId(reader: MergedReader): number {
    const used = new Set(reader.idsByKey.values());
    while (used.has(reader.nextId)) reader.nextId = (reader.nextId % MAX_FILTER_ID) + 1;
    const id = reader.nextId;
    reader.nextId = (id % MAX_FILTER_ID) + 1;
    return id;
  }

  private onState(readerId: number, state: BleWatchState): void {
    const reader = this.readers.get(readerId);
    if (!reader) return;
    reader.state = state;
    for (const origin of reader.parts.keys()) this.sendState(readerId, reader, origin, state);
  }

  /** Excluded filters are reported to their owners only, with the owners' ids. */
  private sendState(readerId: number, reader: MergedReader, origin: string, state: BleWatchState): void {
    let mapped = state;
    if (state.status === 'watching' && state.excluded) {
      const excluded = state.excluded.flatMap(({ id, detail }) =>
        (reader.owners.get(id) ?? [])
          .filter((owner) => owner.origin === origin)
          .map(({ originId }) => ({ id: originId, detail })),
      );
      mapped = excluded.length > 0 ? { status: 'watching', excluded } : { status: 'watching' };
    }
    void this.bus.send(origin, BleClusterMessage.WATCH_STATE, { readerId, state: mapped });
  }

  private onEvents(readerId: number, events: BleWatchDriverEvent[]): void {
    const reader = this.readers.get(readerId);
    if (!reader) return;
    for (const origin of reader.parts.keys()) {
      const own = events.flatMap((event) => {
        const filterIds = event.filterIds.flatMap((id) =>
          (reader.owners.get(id) ?? []).filter((owner) => owner.origin === origin).map((owner) => owner.originId),
        );
        return filterIds.length > 0 ? [encodeWatchEvent({ ...event, filterIds })] : [];
      });
      if (own.length > 0) void this.bus.send(origin, BleClusterMessage.WATCH_EVENTS, { readerId, events: own });
    }
  }
}

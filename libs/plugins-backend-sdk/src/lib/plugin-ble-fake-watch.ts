import { randomUUID } from 'crypto';
import {
  PLUGIN_BLE_WATCH_LIMITS,
  PluginBleError,
  type PluginBleAddressType,
  type PluginBleProfile,
  type PluginBleWatch,
  type PluginBleWatchHandler,
  type PluginBleWatchReaderState,
} from './plugin-ble';
import { matchesBleAdvertisement, normalizeBleAdvertisement } from './plugin-ble-validation';
import {
  BleWatchEngine,
  bleWatchPayloadKey,
  matchesBleWatchFilter,
  requireBleWatchFilter,
  resolveBleWatchOptions,
  type BleWatchCloseReason,
} from './plugin-ble-watch-engine';

/** An advertisement a fake reader sees (`FakeBleHost.advertise`). */
export interface FakeBleWatchAdvertisement {
  address: string;
  /** Default `public`. */
  addressType?: PluginBleAddressType;
  rssi?: number;
  name?: string;
  serviceUuids?: string[];
  manufacturerData?: Array<{ companyId: number; data: Uint8Array }>;
}

export interface FakeBleOpenWatch {
  id: string;
  pluginId: string;
  profileId: string;
}

/** What the watch needs to know about a fake reader. */
export interface FakeBleWatchReader {
  allow: boolean;
  available: boolean;
  unsupported?: string;
  watchUnsupported?: string;
}

interface WatchEntry {
  pluginId: string;
  profile: PluginBleProfile;
  engine: BleWatchEngine;
  /** `null`: every reader open for plugins. */
  listed: Set<number> | null;
  members: Set<number>;
}

/**
 * The advertisement watch of the fake host: the same validation, limits, statuses and delivery as the host, with
 * readers that emit only when a test calls `advertise`.
 */
export class FakeBleWatchHub {
  private readonly watches = new Map<string, WatchEntry>();
  /** Per reader, the payload key last reported per address: what a reader keeps to send `changed`. */
  private readonly seen = new Map<number, Map<string, string>>();

  constructor(
    private readonly deps: {
      reader(readerId: number): FakeBleWatchReader | undefined;
      /** Readers that exist, in id order. */
      readerIds(): number[];
      transportAvailable(): boolean;
      now(): number;
    },
  ) {}

  watch(pluginId: string, profile: PluginBleProfile, handler: PluginBleWatchHandler, options: unknown): PluginBleWatch {
    requireBleWatchFilter(profile);
    const resolved = resolveBleWatchOptions(handler, options ?? {});
    const own = [...this.watches.values()].filter((entry) => entry.pluginId === pluginId).length;
    if (own >= PLUGIN_BLE_WATCH_LIMITS.maxWatchesPerPlugin) {
      throw new PluginBleError('READER_BUSY', 'This plugin has too many advertisement watches', {
        operation: 'watch',
        detail: 'watch-limit',
      });
    }
    const id = randomUUID();
    const entry: WatchEntry = {
      pluginId,
      profile,
      listed: resolved.readerIds ? new Set(resolved.readerIds) : null,
      members: new Set(resolved.readerIds ?? []),
      engine: new BleWatchEngine({
        id,
        profileId: profile.id,
        handler,
        options: resolved,
        onClosed: () => this.watches.delete(id),
      }),
    };
    this.watches.set(id, entry);
    this.refresh();
    return entry.engine.handle;
  }

  /** Recomputes every watch's readers and statuses after a reader, access or transport change. */
  refresh(): void {
    for (const entry of this.watches.values()) {
      if (!entry.listed) {
        for (const readerId of this.deps.readerIds())
          if (this.deps.reader(readerId)?.allow) entry.members.add(readerId);
      }
      for (const readerId of entry.members) entry.engine.setReaderStatus(this.status(readerId));
    }
  }

  private status(readerId: number): PluginBleWatchReaderState {
    const reader = this.deps.reader(readerId);
    if (!reader?.allow) return { readerId, status: 'access-denied' };
    if (!this.deps.transportAvailable()) return { readerId, status: 'unsupported', detail: 'no-transport' };
    if (!reader.available) return { readerId, status: 'offline' };
    if (reader.unsupported !== undefined) return { readerId, status: 'unsupported', detail: reader.unsupported };
    if (reader.watchUnsupported !== undefined) {
      return { readerId, status: 'unsupported', detail: reader.watchUnsupported };
    }
    return { readerId, status: 'watching' };
  }

  /** Like a reader: reports a device its filters match, flagged `changed` unless the payload repeats. */
  advertise(readerId: number, raw: FakeBleWatchAdvertisement, changedOverride?: boolean): void {
    if (this.status(readerId).status !== 'watching') return;
    const advertisement = normalizeBleAdvertisement({
      address: raw.address,
      addressType: raw.addressType ?? 'public',
      rssi: raw.rssi,
      name: raw.name,
      serviceUuids: raw.serviceUuids ?? [],
      manufacturerData: raw.manufacturerData ?? [],
    });
    const watching = [...this.watches.values()].filter((entry) => entry.members.has(readerId));
    // The reader only tracks devices its filter set matches.
    if (!watching.some((entry) => matchesBleWatchFilter(requireBleWatchFilter(entry.profile), advertisement))) return;
    const table = this.seen.get(readerId) ?? new Map<string, string>();
    this.seen.set(readerId, table);
    const key = bleWatchPayloadKey(advertisement);
    const changed = changedOverride ?? table.get(advertisement.address) !== key;
    table.set(advertisement.address, key);
    const receivedAt = new Date(this.deps.now());
    for (const entry of watching) {
      if (matchesBleAdvertisement(entry.profile, advertisement)) {
        entry.engine.push({ ...advertisement, readerId, changed, receivedAt });
      }
    }
  }

  closeWhere(predicate: (entry: { pluginId: string }) => boolean, reason: BleWatchCloseReason): Promise<void> {
    const matching = [...this.watches.values()].filter(predicate);
    return Promise.all(matching.map((entry) => entry.engine.close(reason))).then(() => undefined);
  }

  openWatches(): FakeBleOpenWatch[] {
    return [...this.watches.values()].map((entry) => ({
      id: entry.engine.id,
      pluginId: entry.pluginId,
      profileId: entry.profile.id,
    }));
  }
}

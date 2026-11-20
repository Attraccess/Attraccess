import {
  matchesBleAdvertisement,
  normalizeBleAdvertisement,
  PLUGIN_BLE_WATCH_LIMITS,
  PluginBleError,
  validateBleProfileId,
  type PluginBleAdvertisement,
  type PluginBleProfile,
  type PluginBleWatch,
  type PluginBleWatchHandler,
  type PluginBleWatchOptions,
  type PluginBleWatchReaderState,
} from '@attraccess/plugins-backend-sdk';
import {
  BleWatchEngine,
  requireBleWatchFilter,
  resolveBleWatchOptions,
  type BleWatchCloseReason,
} from '@attraccess/plugins-backend-sdk/internal';
import type { LoggerService } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { PluginBleMetrics, PluginBleWatchDropReason } from '../../metrics/definitions/plugin-ble.metrics';
import {
  resolveBleTransportDriver,
  type BleWatchDriverEvent,
  type BleWatchFilter,
  type BleWatchListener,
  type BleWatchState,
} from './ble-transport-driver';
import { requirePluginBleProfile } from './plugin-ble-profile-registry';
import type { PluginBleStore } from './plugin-ble-store.port';

/** Who is calling: the plugin's stable manifest id and its scoped logger. */
export interface PluginBleWatchCaller {
  pluginId: string;
  logger: LoggerService;
}

export interface PluginBleWatchDeps {
  logger(): LoggerService;
  metrics(): PluginBleMetrics | undefined;
}

type Filter = NonNullable<PluginBleProfile['advertisement']>;

interface WatchEntry {
  id: string;
  pluginId: string;
  profile: PluginBleProfile;
  /** The profile filter, canonical: watches with equal filters share one reader filter. */
  filterKey: string;
  filter: Filter;
  engine: BleWatchEngine;
  /** `null`: every reader open for plugins, including ones opened later. */
  listed: Set<number> | null;
  members: Set<number>;
}

/** The watch set of one reader: filters by key and by their reader-side id, plus what the driver reported. */
interface ReaderWatch {
  open: boolean;
  filters: Map<string, BleWatchFilter>;
  byId: Map<number, string>;
  nextId: number;
  state: BleWatchState | null;
}

const MAX_FILTER_ID = 0xffff;

/**
 * The host side of `context.ble.watch`: watches per plugin, the per-reader union of their profile filters (pushed
 * through `BleTransportDriver.setWatch`), and routing of reader events by filter id. A reader's filter match is
 * never trusted: every event is checked against the watch's own profile, only for readers open for plugins, and
 * only reaches the watches of the filters it names, so no plugin sees another plugin's devices.
 */
export class PluginBleWatchManager implements BleWatchListener {
  private readonly watches = new Map<string, WatchEntry>();
  private readonly readers = new Map<number, ReaderWatch>();
  /** Watches still checking readers, per plugin: they count toward the limit. */
  private readonly creating = new Map<string, number>();
  /** Counts reader access changes; `accessChangedAt` keeps each reader's last one, so a stale check is noticed. */
  private accessChanges = 0;
  private readonly accessChangedAt = new Map<number, number>();

  constructor(
    private readonly store: Pick<PluginBleStore, 'findReader' | 'listOpenReaders'>,
    private readonly moduleRef: ModuleRef,
    private readonly deps: PluginBleWatchDeps,
  ) {}

  async watch(
    caller: PluginBleWatchCaller,
    profileId: string,
    handler: PluginBleWatchHandler,
    options: PluginBleWatchOptions | undefined,
  ): Promise<PluginBleWatch> {
    const profile = requirePluginBleProfile(caller.pluginId, validateBleProfileId(profileId));
    const filter = requireBleWatchFilter(profile);
    const resolved = resolveBleWatchOptions(handler, options ?? {});
    const checkedAt = this.accessChanges;
    const readerIds = await this.reserve(caller.pluginId, async () => {
      const open = new Set((await this.store.listOpenReaders(resolved.readerIds ?? undefined)).map(({ id }) => id));
      return (resolved.readerIds ?? [...open]).map((readerId) => ({ readerId, open: open.has(readerId) }));
    });
    if (resolved.signal?.aborted) throw new PluginBleError('CANCELLED', 'watch was cancelled', { operation: 'watch' });
    const id = randomUUID();
    const entry: WatchEntry = {
      id,
      pluginId: caller.pluginId,
      profile,
      filterKey: JSON.stringify(filter),
      filter,
      listed: resolved.readerIds ? new Set(resolved.readerIds) : null,
      members: new Set(readerIds.map(({ readerId }) => readerId)),
      engine: new BleWatchEngine({
        id,
        profileId: profile.id,
        handler,
        options: resolved,
        onCallbackError: (kind, error) =>
          caller.logger.warn(`ble watch ${id} ${kind} callback failed: ${(error as Error)?.message ?? error}`),
        onDropped: () => this.drop('queue-full'),
        onClosed: (reason) => this.closed(entry, reason),
      }),
    };
    this.watches.set(id, entry);
    this.deps.metrics()?.watchesActive.inc();
    // A reader whose access changed while this checked is checked again; one other watches cover is already current.
    const changed = [...this.accessChangedAt].filter(([, at]) => at > checkedAt).map(([readerId]) => readerId);
    for (const { readerId, open } of readerIds) {
      if (!changed.includes(readerId) && !this.readers.has(readerId)) this.reader(readerId).open = open;
    }
    for (const readerId of entry.members) if (!changed.includes(readerId)) this.syncReader(readerId);
    await Promise.all(changed.map((readerId) => this.readerAccessChanged(readerId)));
    this.deps
      .logger()
      .log(
        `ble watch open watch=${id} plugin=${caller.pluginId} profile=${profile.id} readers=${[...entry.members].join(',') || '-'}`,
      );
    return entry.engine.handle;
  }

  /** Runs `fn` while holding one of the plugin's watch slots; `READER_BUSY` `watch-limit` when none is free. */
  private async reserve<T>(pluginId: string, fn: () => Promise<T>): Promise<T> {
    const own = [...this.watches.values()].filter((entry) => entry.pluginId === pluginId).length;
    const pending = this.creating.get(pluginId) ?? 0;
    if (own + pending >= PLUGIN_BLE_WATCH_LIMITS.maxWatchesPerPlugin) {
      throw new PluginBleError('READER_BUSY', 'This plugin has too many advertisement watches', {
        operation: 'watch',
        detail: 'watch-limit',
      });
    }
    this.creating.set(pluginId, pending + 1);
    try {
      return await fn();
    } finally {
      const left = (this.creating.get(pluginId) ?? 1) - 1;
      if (left > 0) this.creating.set(pluginId, left);
      else this.creating.delete(pluginId);
    }
  }

  closeWhere(predicate: (entry: { pluginId: string }) => boolean, reason: BleWatchCloseReason): Promise<void> {
    const matching = [...this.watches.values()].filter(predicate);
    return Promise.all(matching.map((entry) => entry.engine.close(reason))).then(() => undefined);
  }

  /** A reader was opened, closed or deleted: re-checks it the way scan and connect do. */
  async readerAccessChanged(readerId: number): Promise<void> {
    const change = ++this.accessChanges;
    this.accessChangedAt.set(readerId, change);
    if (this.watches.size === 0) return;
    const open = await this.readerOpen(readerId);
    // A later change of the reader checks it again.
    if (this.accessChangedAt.get(readerId) !== change) return;
    if (open) for (const entry of this.watches.values()) if (!entry.listed) entry.members.add(readerId);
    this.reader(readerId).open = open;
    this.syncReader(readerId);
  }

  private async readerOpen(readerId: number): Promise<boolean> {
    return (await this.store.findReader(readerId))?.allowPluginBle === true;
  }

  private closed(entry: WatchEntry, reason: BleWatchCloseReason): void {
    this.watches.delete(entry.id);
    this.deps.metrics()?.watchesActive.dec();
    this.deps.logger().log(`ble watch closed watch=${entry.id} plugin=${entry.pluginId} reason=${reason}`);
    for (const readerId of entry.members) this.syncReader(readerId);
  }

  private reader(readerId: number): ReaderWatch {
    let reader = this.readers.get(readerId);
    if (!reader) {
      reader = { open: false, filters: new Map(), byId: new Map(), nextId: 1, state: null };
      this.readers.set(readerId, reader);
    }
    return reader;
  }

  private membersOf(readerId: number): WatchEntry[] {
    return [...this.watches.values()].filter((entry) => entry.members.has(readerId));
  }

  /** Recomputes the reader's filter union, pushes it when it changed, then every watch's status for the reader. */
  private syncReader(readerId: number): void {
    const reader = this.reader(readerId);
    const members = this.membersOf(readerId);
    const wanted = new Map((reader.open ? members : []).map((entry) => [entry.filterKey, entry.filter]));
    let changed = false;
    for (const [key, filter] of reader.filters) {
      if (wanted.has(key)) continue;
      reader.filters.delete(key);
      reader.byId.delete(filter.id);
      changed = true;
    }
    for (const [key, filter] of wanted) {
      if (reader.filters.has(key)) continue;
      const id = this.allocateFilterId(reader);
      reader.filters.set(key, {
        id,
        ...filter,
        serviceUuids: [...filter.serviceUuids],
        manufacturerIds: [...filter.manufacturerIds],
      });
      reader.byId.set(id, key);
      changed = true;
    }
    if (changed) this.push(readerId, reader);
    if (members.length === 0) this.readers.delete(readerId);
    else this.updateStatuses(readerId);
  }

  /** Ids are not reused right away, so a late event of a replaced filter cannot reach the new one. */
  private allocateFilterId(reader: ReaderWatch): number {
    while (reader.byId.has(reader.nextId)) reader.nextId = (reader.nextId % MAX_FILTER_ID) + 1;
    const id = reader.nextId;
    reader.nextId = (id % MAX_FILTER_ID) + 1;
    return id;
  }

  private push(readerId: number, reader: ReaderWatch): void {
    const driver = resolveBleTransportDriver(this.moduleRef);
    if (!driver?.setWatch) return;
    const filters = [...reader.filters.values()].map((filter) => ({ ...filter }));
    if (filters.length === 0) reader.state = null;
    this.deps.logger().debug?.(`ble watch set reader=${readerId} filters=${filters.map((f) => f.id).join(',') || '-'}`);
    try {
      driver.setWatch({ readerId, filters, keepaliveMs: PLUGIN_BLE_WATCH_LIMITS.keepaliveMs, listener: this });
    } catch (error) {
      this.deps.logger().warn(`ble watch set failed reader=${readerId}: ${(error as Error)?.name ?? 'error'}`);
      reader.state = { status: 'offline', detail: 'watch-failed' };
    }
  }

  private updateStatuses(readerId: number): void {
    for (const entry of this.membersOf(readerId)) entry.engine.setReaderStatus(this.statusOf(entry, readerId));
  }

  private statusOf(entry: WatchEntry, readerId: number): PluginBleWatchReaderState {
    const reader = this.readers.get(readerId);
    if (!reader?.open) return { readerId, status: 'access-denied' };
    const driver = resolveBleTransportDriver(this.moduleRef);
    if (!driver) return { readerId, status: 'unsupported', detail: 'no-transport' };
    if (!driver.setWatch) return { readerId, status: 'unsupported', detail: 'no-watch-transport' };
    const state = reader.state ?? { status: 'offline' as const };
    if (state.status !== 'watching') {
      return state.detail === undefined ? { readerId, status: state.status } : { readerId, ...state };
    }
    const filterId = reader.filters.get(entry.filterKey)?.id;
    const excluded = state.excluded?.find((filter) => filter.id === filterId);
    if (excluded) return { readerId, status: 'unsupported', detail: excluded.detail };
    return { readerId, status: 'watching' };
  }

  // ------------------------------------------------------------- driver

  onWatchState(readerId: number, state: BleWatchState): void {
    const reader = this.readers.get(readerId);
    if (!reader || reader.filters.size === 0) return;
    const previous = reader.state;
    reader.state = state;
    if (previous?.status !== state.status) {
      const detail = 'detail' in state && state.detail ? ` detail=${state.detail}` : '';
      this.deps.logger().log(`ble watch reader=${readerId} state=${state.status}${detail}`);
    }
    this.updateStatuses(readerId);
  }

  onWatchEvents(readerId: number, events: BleWatchDriverEvent[]): void {
    const reader = this.readers.get(readerId);
    for (const event of events) {
      this.deps.metrics()?.watchEventsReceived.inc();
      const reason = this.route(readerId, reader, event);
      if (reason) this.drop(reason);
    }
  }

  /** Delivers one event to the watches it may reach; returns why it reached none. */
  private route(
    readerId: number,
    reader: ReaderWatch | undefined,
    event: BleWatchDriverEvent,
  ): PluginBleWatchDropReason | null {
    if (!reader?.open) return 'access-denied';
    const advertisement = this.normalize(event);
    if (!advertisement) return 'malformed';
    const keys = new Set(event.filterIds.map((id) => reader.byId.get(id)).filter((key) => key !== undefined));
    const targets = this.membersOf(readerId).filter((entry) => keys.has(entry.filterKey));
    if (targets.length === 0) return 'no-watch';
    let delivered = 0;
    for (const entry of targets) {
      if (!matchesBleAdvertisement(entry.profile, advertisement)) continue;
      entry.engine.push({ ...advertisement, readerId, changed: event.changed, receivedAt: event.receivedAt });
      delivered++;
    }
    this.deps.metrics()?.watchEventsRouted.inc(delivered);
    // Latency: the reader stamps nothing, so the receive time is the reference to compare with the device.
    this.deps
      .logger()
      .debug?.(
        `ble watch event reader=${readerId} filters=${event.filterIds.join(',')} changed=${event.changed} ` +
          `watches=${delivered} receivedAt=${event.receivedAt.toISOString()}`,
      );
    return delivered === 0 ? 'filter-mismatch' : null;
  }

  private normalize(event: BleWatchDriverEvent): PluginBleAdvertisement | null {
    try {
      return normalizeBleAdvertisement(event);
    } catch {
      return null;
    }
  }

  private drop(reason: PluginBleWatchDropReason): void {
    this.deps.metrics()?.watchEventsDropped.inc({ reason });
  }

  /** Open watches (diagnostics and tests). */
  list(): Array<{ id: string; pluginId: string; profileId: string }> {
    return [...this.watches.values()].map(({ id, pluginId, profile }) => ({ id, pluginId, profileId: profile.id }));
  }
}

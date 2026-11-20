import type {
  PluginBleAdvertisement,
  PluginBleAddressType,
  PluginBleOperation,
  PluginBleProfile,
} from '@attraccess/plugins-backend-sdk';
import type { BleSessionLink } from '@attraccess/plugins-backend-sdk/internal';
import type { ModuleRef } from '@nestjs/core';

/**
 * Host-internal reader transport (ATT-1033: `ReaderBleDriver` over the reader websocket). It is deliberately NOT
 * part of the plugin SDK: it only ever receives validated, normalized primitives (reader id, address, UUIDs, bytes,
 * deadlines, abort signal) plus ids for logs, and never sees unvalidated plugin input.
 *
 * The token is a module-private `Symbol()` (not `Symbol.for`), so no plugin module can provide or look up a
 * driver under the same key: only host code that imports this file can register the transport.
 */
export const BLE_TRANSPORT_DRIVER = Symbol('attraccess.host.bleTransportDriver');

/** The registered transport, or undefined on a host without one. */
export function resolveBleTransportDriver(moduleRef: ModuleRef): BleTransportDriver | undefined {
  try {
    return moduleRef.get<BleTransportDriver>(BLE_TRANSPORT_DRIVER, { strict: false }) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * A connected peripheral behind one reader. The session engine calls it one operation at a time, but after a
 * timeout or cancellation it moves on while the aborted call may still be running, so implementations must
 * honour `signal` promptly and settle every call. `write` with `withoutResponse: true` should resolve once the
 * write is queued in order on the reader link, not after a round trip, so bulk transfers are not limited to one
 * round trip per chunk.
 */
export interface BleDriverLink extends BleSessionLink {
  /**
   * Registers the callback for a lost link (peripheral or reader went away). A lost link calls it at once, with a
   * safe diagnostic such as `reader-link-lost`.
   */
  onDisconnected(listener: (detail?: string) => void): void;
}

/**
 * Whether a reader can do BLE right now. `offline`: not connected (or not usable yet); `unsupported`: connected, but
 * its firmware cannot (no or an incompatible `capabilities.ble`), with a safe `detail` such as `no-ble-capability`.
 * A reader busy with another session or OTA is still `available`: `scan`/`connect` reject with `READER_BUSY`.
 */
export type BleReaderStatus =
  { status: 'available' } | { status: 'offline'; detail?: string } | { status: 'unsupported'; detail: string };

/** One characteristic the reader may touch in a session: the profile, as the reader firmware enforces it. */
export interface BleAllowlistEntry {
  serviceUuid: string;
  characteristicUuid: string;
  operations: readonly PluginBleOperation[];
  maxReadBytes: number;
  maxWriteBytes: number;
  maxNotificationBytes: number;
}

/** The profile as the reader firmware enforces it: every characteristic with its operations and bounds. */
export function bleAllowlist(profile: PluginBleProfile): BleAllowlistEntry[] {
  return profile.services.flatMap((service) =>
    service.characteristics.map((characteristic) => ({
      serviceUuid: service.uuid,
      characteristicUuid: characteristic.uuid,
      operations: characteristic.operations,
      maxReadBytes: characteristic.maxReadBytes ?? 0,
      maxWriteBytes: characteristic.maxWriteBytes ?? 0,
      maxNotificationBytes: characteristic.maxNotificationBytes ?? 0,
    })),
  );
}

/** Who a call belongs to, for logs only. Never sent to the reader. */
export interface BleCallContext {
  pluginId: string;
  profileId: string;
  endpointId?: string;
}

/** One filter of a reader's advertisement watch set. `id` is chosen by the host, unique per reader (u16). */
export interface BleWatchFilter {
  id: number;
  serviceUuids: string[];
  manufacturerIds: number[];
  namePrefix?: string;
}

/** One advertisement a watching reader reported: the ids of the filters it matched (reader-side, unverified). */
export interface BleWatchDriverEvent extends PluginBleAdvertisement {
  filterIds: number[];
  changed: boolean;
  receivedAt: Date;
}

/**
 * The watch state of a reader. `watching`: the set went to the reader; `excluded` filters did not, because the
 * reader cannot take them (`too-many-filters`, `filter-too-large`). `offline`/`unsupported` as in `BleReaderStatus`.
 */
export type BleWatchState =
  | { status: 'watching'; excluded?: Array<{ id: number; detail: string }> }
  | { status: 'offline'; detail?: string }
  | { status: 'unsupported'; detail: string };

/** Where a driver reports a reader's watch state and its events. */
export interface BleWatchListener {
  onWatchState(readerId: number, state: BleWatchState): void;
  onWatchEvents(readerId: number, events: BleWatchDriverEvent[]): void;
}

/** Every call gets a host deadline; `connect` and `scan` also get an abort signal they must honour. */
export interface BleTransportDriver {
  /** Must answer quickly (host deadline 5 s). */
  readerStatus(readerId: number): BleReaderStatus | Promise<BleReaderStatus>;
  scan(request: {
    readerId: number;
    filter: { serviceUuids: string[]; manufacturerIds: number[]; namePrefix?: string };
    durationMs: number;
    signal: AbortSignal;
    context: BleCallContext;
  }): Promise<PluginBleAdvertisement[]>;
  connect(request: {
    readerId: number;
    address: string;
    addressType: PluginBleAddressType;
    timeoutMs: number;
    signal: AbortSignal;
    /** The host session id; the reader binds the connection to it. */
    sessionId: string;
    /** The session lease; the reader enforces it (plus grace) on its own. */
    leaseMs: number;
    allowlist: BleAllowlistEntry[];
    context: BleCallContext;
  }): Promise<BleDriverLink>;
  /**
   * Replaces the advertisement watch set of a reader (`filters: []` stops it). The driver keeps the set, pushes it
   * again whenever the reader (re)connects, and reports through `listener`: the reader's state whenever it changes
   * (at least once per call, possibly synchronously) and the events it reports. Independent of scans and sessions.
   * Optional: a driver without it makes every reader `unsupported` (`no-watch-transport`).
   */
  setWatch?(request: {
    readerId: number;
    filters: BleWatchFilter[];
    keepaliveMs: number;
    listener: BleWatchListener;
  }): void;
}

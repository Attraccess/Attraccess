import type { PluginBleAdvertisement, PluginBleAddressType, PluginBleOperation } from '@attraccess/plugins-backend-sdk';
import type { BleSessionLink } from '@attraccess/plugins-backend-sdk/internal';

/**
 * Host-internal reader transport (ATT-1033: `ReaderBleDriver` over the reader websocket). It is deliberately NOT
 * part of the plugin SDK: it only ever receives validated, normalized primitives (reader id, address, UUIDs, bytes,
 * deadlines, abort signal) plus ids for logs, and never sees unvalidated plugin input.
 *
 * The token is a module-private `Symbol()` (not `Symbol.for`), so no plugin module can provide or look up a
 * driver under the same key: only host code that imports this file can register the transport.
 */
export const BLE_TRANSPORT_DRIVER = Symbol('attraccess.host.bleTransportDriver');

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

/** Who a call belongs to, for logs only. Never sent to the reader. */
export interface BleCallContext {
  pluginId: string;
  profileId: string;
  endpointId?: string;
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
}

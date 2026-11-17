import type { PluginBleAdvertisement, PluginBleAddressType } from '@attraccess/plugins-backend-sdk';
import type { BleSessionLink } from '@attraccess/plugins-backend-sdk/internal';

/**
 * Host-internal reader transport that ATT-1033 implements. It is deliberately NOT part of the plugin SDK: it
 * only ever receives validated, normalized primitives (reader id, address, UUIDs, bytes, deadlines, abort
 * signal) and never sees plugin identity, profile keys or unvalidated input.
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
  /** Registers the callback for a lost link (peripheral or reader went away). A lost link calls it at once. */
  onDisconnected(listener: () => void): void;
}

/** Every call gets a host deadline; `connect` and `scan` also get an abort signal they must honour. */
export interface BleTransportDriver {
  /** Whether the reader can do BLE right now (online and capable). Must answer quickly (host deadline 5 s). */
  isReaderAvailable(readerId: number): boolean | Promise<boolean>;
  scan(request: {
    readerId: number;
    filter: { serviceUuids: string[]; manufacturerIds: number[]; namePrefix?: string };
    durationMs: number;
    signal: AbortSignal;
  }): Promise<PluginBleAdvertisement[]>;
  connect(request: {
    readerId: number;
    address: string;
    addressType: PluginBleAddressType;
    timeoutMs: number;
    signal: AbortSignal;
  }): Promise<BleDriverLink>;
}

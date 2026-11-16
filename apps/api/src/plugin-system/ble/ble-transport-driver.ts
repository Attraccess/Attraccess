import type { PluginBleAdvertisement, PluginBleAddressType } from '@attraccess/plugins-backend-sdk';

/**
 * Host-internal reader transport that ATT-1033 implements. It is deliberately NOT part of the plugin SDK: it
 * only ever receives validated, normalized primitives (reader id, address, UUIDs, bytes, deadlines, abort
 * signal) and never sees plugin identity, profile keys or unvalidated input.
 */
export const BLE_TRANSPORT_DRIVER = Symbol.for('attraccess.plugin.bleTransportDriver');

export interface BleDriverCharacteristicRef {
  serviceUuid: string;
  characteristicUuid: string;
}

/** A connected peripheral behind one reader. */
export interface BleDriverLink {
  read(request: BleDriverCharacteristicRef & { signal: AbortSignal }): Promise<Uint8Array>;
  write(
    request: BleDriverCharacteristicRef & { value: Uint8Array; withoutResponse: boolean; signal: AbortSignal },
  ): Promise<void>;
  subscribe(
    request: BleDriverCharacteristicRef & {
      indicate: boolean;
      signal: AbortSignal;
      onNotification(value: Uint8Array): void;
    },
  ): Promise<void>;
  unsubscribe(request: BleDriverCharacteristicRef): Promise<void>;
  disconnect(): Promise<void>;
  /** Registers the callback for a lost link (peripheral or reader went away). */
  onDisconnected(listener: () => void): void;
}

export interface BleTransportDriver {
  /** Whether the reader can do BLE right now (online and capable). */
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

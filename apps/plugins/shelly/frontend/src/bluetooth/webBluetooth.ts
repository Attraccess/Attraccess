// Web Bluetooth entry point: availability check, device chooser and GATT
// connection. The plugin ships its own minimal type surface for the slice of
// `navigator.bluetooth` it uses, so it needs no `@types/web-bluetooth`.
import { ShellyBleError } from './errors';
import {
  SHELLY_RPC_DATA,
  SHELLY_RPC_RX_CONTROL,
  SHELLY_RPC_SERVICE,
  SHELLY_RPC_TX_CONTROL,
  type GattCharacteristic,
} from './gatt';
import { ShellyBleRpc } from './rpc';

interface GattService {
  getCharacteristic(uuid: string): Promise<GattCharacteristic>;
}

interface GattServer {
  getPrimaryService(uuid: string): Promise<GattService>;
}

interface BluetoothDeviceLike {
  name?: string | null;
  gatt?: { connect(): Promise<GattServer>; disconnect(): void };
}

export interface BluetoothLike {
  requestDevice(options: {
    filters: Array<{ services: string[] } | { namePrefix: string }>;
    optionalServices: string[];
  }): Promise<BluetoothDeviceLike>;
}

/** `navigator.bluetooth`, or undefined on Firefox/Safari and outside a secure context. */
export function getBluetooth(): BluetoothLike | undefined {
  if (typeof window === 'undefined' || !window.isSecureContext) return undefined;
  return (navigator as { bluetooth?: BluetoothLike }).bluetooth;
}

export function isWebBluetoothAvailable(): boolean {
  return getBluetooth() !== undefined;
}

export interface ShellyBleConnection {
  advertisedName: string;
  rpc: ShellyBleRpc;
  disconnect: () => void;
}

/** The browser chooser closed without a pick (a DOMException named NotFoundError). */
export function isChooserCancelled(err: unknown): boolean {
  return err instanceof Error && err.name === 'NotFoundError';
}

export async function connectShellyOverBle(bluetooth = getBluetooth()): Promise<ShellyBleConnection> {
  if (!bluetooth) throw new ShellyBleError('unsupported', 'Web Bluetooth is not available');

  // Filters are OR'd: factory-fresh devices advertise the RPC service, but some
  // firmware only puts the name in the advertisement.
  const device = await bluetooth.requestDevice({
    filters: [{ services: [SHELLY_RPC_SERVICE] }, { namePrefix: 'Shelly' }],
    optionalServices: [SHELLY_RPC_SERVICE],
  });

  const gatt = device.gatt;
  if (!gatt) throw new ShellyBleError('noRpcService', 'The selected device does not expose a GATT server');

  let server: GattServer;
  try {
    server = await gatt.connect();
  } catch {
    throw new ShellyBleError('linkLost', 'Could not connect to the device over Bluetooth');
  }
  try {
    const service = await server.getPrimaryService(SHELLY_RPC_SERVICE);
    const [data, txControl, rxControl] = await Promise.all([
      service.getCharacteristic(SHELLY_RPC_DATA),
      service.getCharacteristic(SHELLY_RPC_TX_CONTROL),
      service.getCharacteristic(SHELLY_RPC_RX_CONTROL),
    ]);
    return {
      advertisedName: device.name ?? 'Shelly',
      rpc: new ShellyBleRpc({ data, txControl, rxControl }),
      disconnect: () => gatt.disconnect(),
    };
  } catch {
    gatt.disconnect();
    throw new ShellyBleError('noRpcService', 'The device does not expose the Shelly RPC Bluetooth service');
  }
}

// Shelly Gen2+ JSON-RPC over Bluetooth LE (ATT-502).
//
// The radio lives in the operator's browser, not on the server: an off-network
// device is by definition unreachable over IP, and the API usually runs in a
// container in a rack rather than next to the device being installed.
//
// Shelly's mOS firmware exposes RPC through a custom GATT service whose UUIDs
// spell their purpose in ASCII ("_mOS_RPC_data___", "_mOS_RPC_tx_ctl_", …).
// One call is four steps:
//   1. write the request's byte length (uint32, big endian) to the TX control char,
//   2. write the JSON body to the data char in chunks,
//   3. poll the RX control char until it reports the response length,
//   4. read the data char until that many bytes have arrived.
//
// Everything here is deliberately free of DOM types so it can be unit-tested in
// Jest's node environment against a fake characteristic triple.

export const SHELLY_RPC_SERVICE = '5f6d4f53-5f52-5043-5f53-56435f49445f';
export const SHELLY_RPC_DATA = '5f6d4f53-5f52-5043-5f64-6174615f5f5f';
export const SHELLY_RPC_TX_CONTROL = '5f6d4f53-5f52-5043-5f74-785f63746c5f';
export const SHELLY_RPC_RX_CONTROL = '5f6d4f53-5f52-5043-5f72-785f63746c5f';
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** The slice of `BluetoothRemoteGATTCharacteristic` this module needs. */
export interface GattCharacteristic {
  readValue(): Promise<DataView>;
  writeValue(value: Uint8Array): Promise<void>;
}

export interface RpcChannel {
  data: GattCharacteristic;
  txControl: GattCharacteristic;
  rxControl: GattCharacteristic;
}

export interface RpcOptions {
  /** Web Bluetooth hides the negotiated MTU, so stay under the 23-byte floor. */
  chunkSize?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function uint32BE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

interface RpcEnvelope<T> {
  result?: T;
  error?: { code?: number; message?: string };
}

export class ShellyBleRpc {
  private nextId = 1;
  private readonly chunkSize: number;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly channel: RpcChannel,
    options: RpcOptions = {},
  ) {
    this.chunkSize = options.chunkSize ?? 20;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const frame = new TextEncoder().encode(
      JSON.stringify({ id: this.nextId++, src: 'attraccess', method, ...(params ? { params } : {}) }),
    );

    await this.channel.txControl.writeValue(uint32BE(frame.length));
    for (let offset = 0; offset < frame.length; offset += this.chunkSize) {
      await this.channel.data.writeValue(frame.subarray(offset, offset + this.chunkSize));
    }

    const raw = new TextDecoder().decode(await this.readResponse());
    let envelope: RpcEnvelope<T>;
    try {
      envelope = JSON.parse(raw) as RpcEnvelope<T>;
    } catch {
      throw new Error(`${method}: device sent a malformed response`);
    }
    if (envelope.error) {
      throw new Error(
        `${method} failed: ${envelope.error.message ?? 'unknown error'} (code ${envelope.error.code ?? '?'})`,
      );
    }
    return envelope.result as T;
  }

  private async readResponse(): Promise<Uint8Array> {
    const length = await this.awaitResponseLength();
    if (length > MAX_RESPONSE_BYTES) {
      throw new Error(`Bluetooth response is too large (${length} bytes)`);
    }
    const out = new Uint8Array(length);
    let filled = 0;
    while (filled < length) {
      const view = await this.channel.data.readValue();
      if (view.byteLength === 0) {
        throw new Error('Bluetooth response ended early — the device stopped sending');
      }
      const chunk = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      const take = Math.min(chunk.length, length - filled);
      out.set(chunk.subarray(0, take), filled);
      filled += take;
    }
    return out;
  }

  private async awaitResponseLength(): Promise<number> {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const view = await this.channel.rxControl.readValue();
      const length = view.byteLength >= 4 ? view.getUint32(0, false) : 0;
      if (length > 0) return length;
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for the device to answer over Bluetooth');
      }
      await this.sleep(this.pollIntervalMs);
    }
  }
}

// --- Web Bluetooth entry point -------------------------------------------------

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
  requestDevice(options: unknown): Promise<BluetoothDeviceLike>;
}

/** `navigator.bluetooth`, or undefined on Firefox/Safari and outside a secure context. */
export function getBluetooth(): BluetoothLike | undefined {
  return (globalThis as { navigator?: { bluetooth?: BluetoothLike } }).navigator?.bluetooth;
}

export interface ShellyBleConnection {
  advertisedName: string;
  rpc: ShellyBleRpc;
  disconnect: () => void;
}

export async function connectShellyOverBle(bluetooth = getBluetooth()): Promise<ShellyBleConnection> {
  if (!bluetooth) {
    throw new Error(
      'This browser cannot use Bluetooth. Web Bluetooth needs Chrome or Edge on an HTTPS page (or http://localhost).',
    );
  }

  // Two filters (OR'd): factory-fresh devices advertise the RPC service, but
  // some firmwares only put the name in the advertisement.
  const device = await bluetooth.requestDevice({
    filters: [{ services: [SHELLY_RPC_SERVICE] }, { namePrefix: 'Shelly' }],
    optionalServices: [SHELLY_RPC_SERVICE],
  });

  const gatt = device.gatt;
  if (!gatt) throw new Error('The selected device does not expose a GATT server.');

  const server = await gatt.connect();
  try {
    const service = await server.getPrimaryService(SHELLY_RPC_SERVICE);
    const [data, txControl, rxControl] = await Promise.all([
      service.getCharacteristic(SHELLY_RPC_DATA),
      service.getCharacteristic(SHELLY_RPC_TX_CONTROL),
      service.getCharacteristic(SHELLY_RPC_RX_CONTROL),
    ]);

    return {
      advertisedName: device.name ?? 'Shelly device',
      rpc: new ShellyBleRpc({ data, txControl, rxControl }),
      disconnect: () => gatt.disconnect(),
    };
  } catch {
    gatt.disconnect();
    throw new Error(
      'This device does not expose the required Shelly RPC Bluetooth characteristics. Gen1 devices never do; on Gen2+ check that Bluetooth and its RPC are enabled in the device settings.',
    );
  }
}

// --- Provisioning --------------------------------------------------------------

export type ProvisionStage = 'identifying' | 'sending-credentials' | 'joining';

export interface BleDeviceInfo {
  id?: string;
  model?: string;
  gen?: number;
  ver?: string;
}

export interface ProvisionResult {
  info: BleDeviceInfo;
  /** null when the device had to reboot before we could read its address. */
  ipAddress: string | null;
  restartRequired: boolean;
}

interface WifiStatus {
  status?: string;
  sta_ip?: string | null;
  ssid?: string | null;
}

export interface ProvisionOptions {
  onStage?: (stage: ProvisionStage) => void;
  /** How long to wait for the device to obtain an IP after taking credentials. */
  joinTimeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** True for RFC1918 and link-local IPv4 literals, never hostnames or URLs. */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export async function provisionWifiOverBle(
  rpc: Pick<ShellyBleRpc, 'call'>,
  credentials: { ssid: string; password: string },
  options: ProvisionOptions = {},
): Promise<ProvisionResult> {
  const { onStage, joinTimeoutMs = 60_000, pollIntervalMs = 2_000, sleep = defaultSleep } = options;

  onStage?.('identifying');
  const info = await rpc.call<BleDeviceInfo>('Shelly.GetDeviceInfo');

  onStage?.('sending-credentials');
  const sta = credentials.password
    ? { ssid: credentials.ssid, pass: credentials.password, is_open: false, enable: true }
    : { ssid: credentials.ssid, is_open: true, enable: true };
  const setResult = await rpc.call<{ restart_required?: boolean }>('WiFi.SetConfig', { config: { sta } });

  if (setResult?.restart_required) {
    // The BLE link dies with the reboot, so we cannot observe the join. The
    // operator finishes with Discover once the device is on the network.
    await rpc.call('Shelly.Reboot').catch(() => undefined);
    return { info, ipAddress: null, restartRequired: true };
  }

  onStage?.('joining');
  const deadline = Date.now() + joinTimeoutMs;
  let lastStatus = 'unknown';
  for (;;) {
    const wifi = await rpc.call<WifiStatus>('WiFi.GetStatus');
    lastStatus = wifi?.status ?? 'unknown';
    if (lastStatus === 'got ip' && wifi?.sta_ip) {
      if (!isPrivateIpv4(wifi.sta_ip)) {
        throw new Error('Device reported an invalid private IPv4 address');
      }
      return { info, ipAddress: wifi.sta_ip, restartRequired: false };
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Device did not join "${credentials.ssid}" within ${Math.round(joinTimeoutMs / 1000)}s (last status: ${lastStatus}). ` +
          'Check the password, and that the network is 2.4 GHz — Shelly devices cannot join 5 GHz networks.',
      );
    }
    await sleep(pollIntervalMs);
  }
}

/**
 * Switch the device's Bluetooth radio off, once it is on the network and in the
 * registry. Provisioning is the only thing we need BLE for, and Shelly's RPC
 * over GATT is unauthenticated by default — leaving it enabled hands anyone in
 * radio range the same control the operator just used.
 *
 * Called after registration, never before: an aborted onboarding has to stay
 * reachable over Bluetooth for the retry.
 */
export async function disableBleRadio(rpc: Pick<ShellyBleRpc, 'call'>): Promise<void> {
  const result = await rpc.call<{ restart_required?: boolean }>('BLE.SetConfig', { config: { enable: false } });
  if (result?.restart_required) {
    // The answer may never arrive — the device can drop the link as it reboots.
    // It still rebooted, so that is not a failure.
    await rpc.call('Shelly.Reboot').catch(() => undefined);
  }
}

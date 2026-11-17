import {
  PLUGIN_BLE_LIMITS,
  PluginBleError,
  PluginBleErrorCode,
  type PluginBleAdvertisement,
  type PluginBleOperation,
} from '@attraccess/plugins-backend-sdk';

/**
 * Plugin BLE reader protocol, version 1 (ATT-1033/ATT-1036). JSON EVENT messages on the paired reader link (the
 * session transport) only, without the generic ACK; a reader signed in with its legacy token gets no BLE. Bytes
 * travel as base64. Every message carries `v`; every request a server-assigned `sessionId` and a per-connection
 * `requestId`.
 */
export const BLE_PROTOCOL_VERSION = 1;

/** The operations a reader must announce in `capabilities.ble.operations`. */
export const BLE_REQUIRED_OPERATIONS = [
  'scan',
  'connect',
  'read',
  'write',
  'writeWithoutResponse',
  'subscribe',
  'unsubscribe',
  'cancel',
] as const;

/** The reader parses each message in one fixed buffer: a BLE request never exceeds this size. */
export const BLE_MAX_SERVER_FRAME_BYTES = 4096;
/**
 * Requests in flight per reader connection, abandoned ones included: a reader cannot grow this without bound. A
 * reader that announces a smaller `maxPendingRequests` gets that.
 */
export const BLE_MAX_PENDING_REQUESTS = 32;
/** Advertisement data is at most 31 bytes per packet (advertisement + scan response). */
const MAX_MANUFACTURER_DATA_BYTES = 62;
const MAX_DETAIL_LENGTH = 64;
const SAFE_DETAIL = /^[A-Za-z0-9:._=<>\- ]+$/;

/** What a reader announced in `capabilities.ble`, clamped to what the API supports. */
export interface BleReaderCapability {
  version: number;
  maxMtu: number;
  maxPayloadBytes: number;
  maxNotificationQueue: number;
  maxScanMs: number;
  maxScanResults: number;
  maxAllowlistEntries: number;
  /** GATT requests the reader queues per session; the API keeps at most this many in flight. */
  maxPendingRequests: number;
}

/** `undefined` on the socket: firmware info not received yet. */
export type BleCapabilityState =
  { supported: true; capability: BleReaderCapability } | { supported: false; detail: string };

function boundedInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/** Negotiates `capabilities.ble` from READER_FIRMWARE_INFO. Never throws: anything unusable is `unsupported`. */
export function parseBleCapability(raw: unknown): BleCapabilityState {
  if (raw === undefined || raw === null) return { supported: false, detail: 'no-ble-capability' };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { supported: false, detail: 'no-ble-capability' };
  const ble = raw as Record<string, unknown>;
  if (ble.version !== BLE_PROTOCOL_VERSION) {
    const version = typeof ble.version === 'number' && Number.isInteger(ble.version) ? ble.version : 'invalid';
    return { supported: false, detail: `protocol-version:${version}` };
  }
  const operations = Array.isArray(ble.operations) ? ble.operations : [];
  for (const operation of BLE_REQUIRED_OPERATIONS) {
    if (!operations.includes(operation)) return { supported: false, detail: `missing-operation:${operation}` };
  }
  return {
    supported: true,
    capability: {
      version: BLE_PROTOCOL_VERSION,
      maxMtu: boundedInt(ble.maxMtu, PLUGIN_BLE_LIMITS.mtuMin, PLUGIN_BLE_LIMITS.mtuMax, PLUGIN_BLE_LIMITS.mtuMin),
      maxPayloadBytes: boundedInt(ble.maxPayloadBytes, 20, PLUGIN_BLE_LIMITS.payloadMaxBytes, 20),
      maxNotificationQueue: boundedInt(ble.maxNotificationQueue, 1, 1024, 1),
      maxScanMs: boundedInt(ble.maxScanMs, 1, PLUGIN_BLE_LIMITS.scanMaxMs, PLUGIN_BLE_LIMITS.scanMaxMs),
      maxScanResults: boundedInt(ble.maxScanResults, 1, 32, 32),
      maxAllowlistEntries: boundedInt(ble.maxAllowlistEntries, 1, 64, 16),
      maxPendingRequests: boundedInt(ble.maxPendingRequests, 1, BLE_MAX_PENDING_REQUESTS, BLE_MAX_PENDING_REQUESTS),
    },
  };
}

/** Wire bitmask of allowed operations per allowlist entry. */
const OPERATION_BITS: Record<PluginBleOperation, number> = {
  read: 1,
  write: 2,
  writeWithoutResponse: 4,
  notify: 8,
  indicate: 16,
};

export function encodeBleOperations(operations: readonly PluginBleOperation[]): number {
  return operations.reduce((bits, operation) => bits | OPERATION_BITS[operation], 0);
}

/** Longest base64 text that can decode to `bytes` bytes. */
export function base64LengthFor(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Reader-supplied bytes: decoded, or why not (`malformed`: missing or not base64; `oversized`: above the bound). */
export type BleDecodedBytes = { bytes: Uint8Array } | { error: 'malformed' | 'oversized' };

/**
 * Decodes reader-supplied base64. The length is checked before decoding, so a reader cannot make the API allocate
 * more than `maxBytes`.
 */
export function readBleBytes(value: unknown, maxBytes: number): BleDecodedBytes {
  if (typeof value !== 'string') return { error: 'malformed' };
  if (value.length > base64LengthFor(maxBytes)) return { error: 'oversized' };
  if (value.length % 4 !== 0 || !BASE64.test(value)) return { error: 'malformed' };
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maxBytes) return { error: 'oversized' };
  return { bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length) };
}

/** `readBleBytes` for callers that only skip what they cannot use: null for anything malformed or too long. */
export function decodeBleBytes(value: unknown, maxBytes: number): Uint8Array | null {
  const decoded = readBleBytes(value, maxBytes);
  return 'bytes' in decoded ? decoded.bytes : null;
}

/** A reader-supplied number for a log line: an integer, or `invalid`. Never the reader's raw text. */
export function loggableInt(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : 'invalid';
}

export function encodeBleBytes(value: Uint8Array): string {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
}

const KNOWN_CODES = new Set<string>(Object.values(PluginBleErrorCode));

/** A reader's detail is shown to plugins and logged: only short, plain diagnostic text survives. */
export function safeBleDetail(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_DETAIL_LENGTH) return undefined;
  return SAFE_DETAIL.test(value) ? value : undefined;
}

/** Maps a reader's `error` object to the plugin taxonomy. Unknown codes become INTERNAL. */
export function bleWireError(raw: unknown, operation: string): PluginBleError {
  const error = (typeof raw === 'object' && raw !== null ? raw : {}) as { code?: unknown; detail?: unknown };
  const code = typeof error.code === 'string' && KNOWN_CODES.has(error.code) ? error.code : 'INTERNAL';
  const detail = safeBleDetail(error.detail) ?? (code === 'INTERNAL' && error.code ? 'unknown-reader-code' : undefined);
  return new PluginBleError(code as PluginBleErrorCode, `The reader reported ${code} for ${operation}`, {
    operation,
    detail,
  });
}

const ADDRESS = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/;

/**
 * Validates one advertisement from BLE_SCAN_RESULT. Malformed entries are skipped (null); the plugin service
 * normalizes and filters again.
 */
export function decodeBleAdvertisement(raw: unknown): PluginBleAdvertisement | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.address !== 'string' || !ADDRESS.test(entry.address)) return null;
  if (entry.addressType !== 'public' && entry.addressType !== 'random') return null;
  const serviceUuids = Array.isArray(entry.serviceUuids)
    ? entry.serviceUuids.filter((uuid): uuid is string => typeof uuid === 'string' && uuid.length <= 36).slice(0, 16)
    : [];
  const manufacturerData: PluginBleAdvertisement['manufacturerData'] = [];
  for (const item of Array.isArray(entry.manufacturerData) ? entry.manufacturerData.slice(0, 8) : []) {
    const record = (item ?? {}) as { companyId?: unknown; data?: unknown };
    const data = decodeBleBytes(record.data, MAX_MANUFACTURER_DATA_BYTES);
    if (typeof record.companyId !== 'number' || !data) continue;
    manufacturerData.push({ companyId: record.companyId, data });
  }
  const advertisement: PluginBleAdvertisement = {
    address: entry.address,
    addressType: entry.addressType,
    serviceUuids,
    manufacturerData,
  };
  if (typeof entry.rssi === 'number' && Number.isInteger(entry.rssi)) advertisement.rssi = entry.rssi;
  if (typeof entry.name === 'string' && entry.name.length <= 64) advertisement.name = entry.name;
  return advertisement;
}

/**
 * Plugin BLE transport contract (permission `BLE_TRANSPORT`).
 *
 * The contract is deliberately NOT a raw GATT API. A plugin registers an immutable profile (the services,
 * characteristics, operations and payload bounds it may touch), binds an endpoint to a physical device through
 * an administrator-approved Attractap reader, and then talks to the device through a session that only accepts
 * profile keys. Core owns reader access, identity, bounds, ownership, deadlines and cleanup; the plugin owns the
 * vendor semantics (advertisement parsing, credentials, command protocol).
 */

/** Stable, machine-readable error codes. Never rename or remove a code. */
export const PluginBleErrorCode = {
  NOT_READY: 'NOT_READY',
  TRANSPORT_UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
  READER_NOT_FOUND: 'READER_NOT_FOUND',
  READER_ACCESS_DENIED: 'READER_ACCESS_DENIED',
  READER_OFFLINE: 'READER_OFFLINE',
  READER_UNSUPPORTED: 'READER_UNSUPPORTED',
  READER_BUSY: 'READER_BUSY',
  PROFILE_NOT_REGISTERED: 'PROFILE_NOT_REGISTERED',
  PROFILE_CONFLICT: 'PROFILE_CONFLICT',
  INVALID_PROFILE: 'INVALID_PROFILE',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  ENDPOINT_NOT_FOUND: 'ENDPOINT_NOT_FOUND',
  ENDPOINT_CONFLICT: 'ENDPOINT_CONFLICT',
  ENDPOINT_BUSY: 'ENDPOINT_BUSY',
  UNKNOWN_CHARACTERISTIC: 'UNKNOWN_CHARACTERISTIC',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  SESSION_CLOSED: 'SESSION_CLOSED',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  DISCONNECTED: 'DISCONNECTED',
  GATT_ERROR: 'GATT_ERROR',
  NOTIFICATION_OVERFLOW: 'NOTIFICATION_OVERFLOW',
  INTERNAL: 'INTERNAL',
} as const;

export type PluginBleErrorCode = (typeof PluginBleErrorCode)[keyof typeof PluginBleErrorCode];

/** Codes for which retrying the same call later can succeed without changing anything. */
export const PLUGIN_BLE_RETRYABLE_CODES: readonly PluginBleErrorCode[] = [
  PluginBleErrorCode.NOT_READY,
  PluginBleErrorCode.TRANSPORT_UNAVAILABLE,
  PluginBleErrorCode.READER_OFFLINE,
  PluginBleErrorCode.READER_BUSY,
  PluginBleErrorCode.ENDPOINT_BUSY,
  PluginBleErrorCode.TIMEOUT,
  PluginBleErrorCode.DEVICE_NOT_FOUND,
  PluginBleErrorCode.CONNECTION_FAILED,
  PluginBleErrorCode.DISCONNECTED,
];

/**
 * Error thrown (or rejected) by every BLE call. `detail` is a safe diagnostic and never contains payload bytes
 * or credentials. Permission failures stay `PluginPermissionError`.
 */
export class PluginBleError extends Error {
  public readonly code: PluginBleErrorCode;
  public readonly retryable: boolean;
  public readonly operation?: string;
  public readonly detail?: string;

  constructor(code: PluginBleErrorCode, message: string, options: { operation?: string; detail?: string } = {}) {
    super(message);
    this.name = 'PluginBleError';
    this.code = code;
    this.retryable = PLUGIN_BLE_RETRYABLE_CODES.includes(code);
    this.operation = options.operation;
    this.detail = options.detail;
  }
}

/** Host caps. Values are milliseconds unless the name says otherwise. */
export const PLUGIN_BLE_LIMITS = {
  opTimeoutDefaultMs: 10_000,
  opTimeoutMaxMs: 60_000,
  connectTimeoutDefaultMs: 15_000,
  connectTimeoutMaxMs: 60_000,
  leaseDefaultMs: 30_000,
  leaseMaxMs: 15 * 60_000,
  scanDefaultMs: 5_000,
  scanMaxMs: 15_000,
  notificationQueueDefault: 32,
  notificationQueueMax: 256,
  payloadMaxBytes: 512,
  labelMaxLength: 100,
} as const;

export const PLUGIN_BLE_OPERATIONS = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'] as const;
export type PluginBleOperation = (typeof PLUGIN_BLE_OPERATIONS)[number];

export type PluginBleAddressType = 'public' | 'random';

export type PluginBleCloseReason =
  | 'closed'
  | 'lease-expired'
  | 'cancelled'
  | 'disconnected'
  | 'reader-access-revoked'
  | 'endpoint-deleted'
  | 'shutdown'
  | 'error';

// ---------------------------------------------------------------- profiles

export interface PluginBleCharacteristicDefinition {
  /** Profile-local name used by every operation. Pattern `/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/`, unique per profile. */
  key: string;
  /** 16-bit, 32-bit or 128-bit UUID. Normalized to lowercase 128-bit. */
  uuid: string;
  /** Allowed operations: non-empty, no duplicates. */
  operations: PluginBleOperation[];
  /** 1..512, required when `read` is allowed. */
  maxReadBytes?: number;
  /** 1..512, required when `write` or `writeWithoutResponse` is allowed. */
  maxWriteBytes?: number;
  /** 1..512, required when `notify` or `indicate` is allowed. */
  maxNotificationBytes?: number;
}

export interface PluginBleServiceDefinition {
  uuid: string;
  characteristics: PluginBleCharacteristicDefinition[];
}

export interface PluginBleAdvertisementFilter {
  serviceUuids?: string[];
  /** Bluetooth company identifiers, 0..0xffff. */
  manufacturerIds?: number[];
  namePrefix?: string;
}

export interface PluginBleProfileDefinition {
  /** Pattern `/^[a-z0-9][a-z0-9-]{0,63}$/`, unique per plugin. */
  id: string;
  /** Without a filter the profile cannot scan. */
  advertisement?: PluginBleAdvertisementFilter;
  /** At least one service with at least one characteristic. */
  services: PluginBleServiceDefinition[];
  limits?: {
    /** Session lease cap, 1..900000 ms (default 30000). */
    maxSessionMs?: number;
    /** Notification queue size per subscription, 1..256 (default 32). */
    maxNotificationQueue?: number;
  };
}

export interface PluginBleCharacteristic {
  readonly key: string;
  readonly uuid: string;
  readonly operations: readonly PluginBleOperation[];
  readonly maxReadBytes?: number;
  readonly maxWriteBytes?: number;
  readonly maxNotificationBytes?: number;
}

/** Normalized, deep-frozen profile returned by `registerProfile`. */
export interface PluginBleProfile {
  readonly id: string;
  readonly advertisement?: {
    readonly serviceUuids: readonly string[];
    readonly manufacturerIds: readonly number[];
    readonly namePrefix?: string;
  };
  readonly services: ReadonlyArray<{
    readonly uuid: string;
    readonly characteristics: readonly PluginBleCharacteristic[];
  }>;
  readonly limits: { readonly maxSessionMs: number; readonly maxNotificationQueue: number };
}

// ------------------------------------------------------- readers and scan

export interface PluginBleReader {
  readerId: number;
  name: string;
  /** False when no transport driver is present or the reader cannot do BLE right now. */
  available: boolean;
}

export interface PluginBleAdvertisement {
  /** `XX:XX:XX:XX:XX:XX`, uppercase. */
  address: string;
  addressType: PluginBleAddressType;
  rssi?: number;
  name?: string;
  /** Normalized 128-bit UUIDs. */
  serviceUuids: string[];
  manufacturerData: Array<{ companyId: number; data: Uint8Array }>;
}

export interface PluginBleScanOptions {
  /** Default 5000, max 15000. */
  durationMs?: number;
  signal?: AbortSignal;
}

// --------------------------------------------------------------- endpoints

export interface PluginBleEndpointInput {
  readerId: number;
  /** `XX:XX:XX:XX:XX:XX`, normalized to uppercase. */
  address: string;
  addressType: PluginBleAddressType;
  profileId: string;
  /** Max 100 characters. */
  label?: string;
}

export interface PluginBleEndpointUpdate {
  readerId?: number;
  address?: string;
  addressType?: PluginBleAddressType;
  /** `null` clears the label. */
  label?: string | null;
}

export interface PluginBleEndpoint {
  /** Opaque stable id (UUID). */
  id: string;
  readerId: number;
  address: string;
  addressType: PluginBleAddressType;
  profileId: string;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------- sessions

export interface PluginBleSessionOptions {
  /** Aborting closes the session (or cancels the connect). */
  signal?: AbortSignal;
  /** Session lease, default 30000, capped by the profile's `maxSessionMs` (max 900000). */
  leaseMs?: number;
  /** Default 15000, max 60000. */
  connectTimeoutMs?: number;
}

export interface PluginBleCallOptions {
  signal?: AbortSignal;
  /** Default 10000, max 60000. */
  timeoutMs?: number;
}

export interface PluginBleWriteOptions extends PluginBleCallOptions {
  /** Requires the `writeWithoutResponse` operation; otherwise `write` is required. */
  withoutResponse?: boolean;
}

export interface PluginBleNotification {
  key: string;
  value: Uint8Array;
  receivedAt: Date;
}

export interface PluginBleNotificationStream extends AsyncIterable<PluginBleNotification> {
  /** Resolves with the next notification, in arrival order. Rejects with `TIMEOUT` or `CANCELLED` without closing the stream. */
  next(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<PluginBleNotification>;
  unsubscribe(): Promise<void>;
}

export interface PluginBleSession {
  readonly id: string;
  readonly endpointId: string;
  read(key: string, options?: PluginBleCallOptions): Promise<Uint8Array>;
  write(key: string, value: Uint8Array, options?: PluginBleWriteOptions): Promise<void>;
  subscribe(key: string, options?: { signal?: AbortSignal }): Promise<PluginBleNotificationStream>;
  unsubscribe(key: string): Promise<void>;
  /** Idempotent. */
  close(): Promise<void>;
  /** Resolves (never rejects) once the session ended, with the reason. */
  readonly closed: Promise<{ reason: PluginBleCloseReason }>;
}

/** `context.ble`. Requires the `BLE_TRANSPORT` permission. */
export interface PluginBleContext {
  /** Synchronous and valid at any time, including plugin constructors and module scope. */
  registerProfile(definition: PluginBleProfileDefinition): PluginBleProfile;
  listReaders(): Promise<PluginBleReader[]>;
  scan(readerId: number, profileId: string, options?: PluginBleScanOptions): Promise<PluginBleAdvertisement[]>;
  createEndpoint(input: PluginBleEndpointInput): Promise<PluginBleEndpoint>;
  getEndpoint(id: string): Promise<PluginBleEndpoint>;
  listEndpoints(): Promise<PluginBleEndpoint[]>;
  updateEndpoint(id: string, update: PluginBleEndpointUpdate): Promise<PluginBleEndpoint>;
  deleteEndpoint(id: string): Promise<void>;
  openSession(endpointId: string, options?: PluginBleSessionOptions): Promise<PluginBleSession>;
  /** Opens a session, runs `fn` and always closes the session, also when `fn` throws. */
  withSession<T>(
    endpointId: string,
    fn: (session: PluginBleSession) => Promise<T>,
    options?: PluginBleSessionOptions,
  ): Promise<T>;
}

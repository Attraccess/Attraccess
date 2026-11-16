import {
  PLUGIN_BLE_LIMITS,
  PLUGIN_BLE_OPERATIONS,
  PluginBleAddressType,
  PluginBleAdvertisement,
  PluginBleCharacteristic,
  PluginBleEndpointInput,
  PluginBleEndpointUpdate,
  PluginBleError,
  PluginBleErrorCode,
  PluginBleOperation,
  PluginBleProfile,
  PluginBleProfileDefinition,
} from './plugin-ble';

/**
 * Pure validation shared by the host and the fake transport. Enforcement always runs host-side; plugins cannot
 * skip it. Every function throws `PluginBleError` with a message that names the offending field.
 */

const BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';
const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CHARACTERISTIC_KEY = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;
const ADDRESS = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
const MAX_NAME_PREFIX = 64;

type ErrorCode = typeof PluginBleErrorCode.INVALID_PROFILE | typeof PluginBleErrorCode.INVALID_ARGUMENT;

function invalid(code: ErrorCode, field: string, problem: string): never {
  throw new PluginBleError(code, `${field}: ${problem}`, { detail: field });
}

export function isBleBytes(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (typeof value === 'object' && value !== null && Object.prototype.toString.call(value) === '[object Uint8Array]')
  );
}

/** Normalizes a 16-, 32- or 128-bit UUID to lowercase 128-bit with dashes. */
export function normalizeBleUuid(value: unknown, field = 'uuid', code: ErrorCode = 'INVALID_PROFILE'): string {
  if (typeof value !== 'string') return invalid(code, field, 'must be a UUID string');
  const text = value.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(text)) return `0000${text}${BASE_UUID_SUFFIX}`;
  if (/^[0-9a-f]{8}$/.test(text)) return `${text}${BASE_UUID_SUFFIX}`;
  const compact = text.replace(/-/g, '');
  const dashed = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text);
  if (dashed || /^[0-9a-f]{32}$/.test(text)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  }
  return invalid(code, field, 'must be a 16-bit, 32-bit or 128-bit Bluetooth UUID');
}

/** Normalizes `xx:xx:xx:xx:xx:xx` to uppercase. */
export function normalizeBleAddress(value: unknown, field = 'address'): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!ADDRESS.test(text)) return invalid('INVALID_ARGUMENT', field, 'must look like XX:XX:XX:XX:XX:XX');
  return text;
}

export function normalizeBleAddressType(value: unknown, field = 'addressType'): PluginBleAddressType {
  if (value !== 'public' && value !== 'random')
    return invalid('INVALID_ARGUMENT', field, "must be 'public' or 'random'");
  return value;
}

export function validateBleReaderId(value: unknown, field = 'readerId'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return invalid('INVALID_ARGUMENT', field, 'must be a positive integer');
  }
  return value;
}

export function validateBleProfileId(
  value: unknown,
  field = 'profileId',
  code: ErrorCode = 'INVALID_ARGUMENT',
): string {
  if (typeof value !== 'string' || !PROFILE_ID.test(value)) {
    return invalid(code, field, 'must match /^[a-z0-9][a-z0-9-]{0,63}$/');
  }
  return value;
}

function boundedInteger(value: unknown, field: string, min: number, max: number, code: ErrorCode): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return invalid(code, field, `must be an integer between ${min} and ${max}`);
  }
  return value;
}

function normalizeCharacteristic(
  raw: unknown,
  path: string,
  keys: Set<string>,
  uuids: Set<string>,
): PluginBleCharacteristic {
  const c = raw as Record<string, unknown> | null;
  if (typeof c !== 'object' || c === null) return invalid('INVALID_PROFILE', path, 'must be an object');
  const key = c.key;
  if (typeof key !== 'string' || !CHARACTERISTIC_KEY.test(key)) {
    return invalid('INVALID_PROFILE', `${path}.key`, 'must match /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/');
  }
  if (keys.has(key)) return invalid('INVALID_PROFILE', `${path}.key`, `duplicate key "${key}"`);
  keys.add(key);
  const uuid = normalizeBleUuid(c.uuid, `${path}.uuid`);
  if (uuids.has(uuid)) return invalid('INVALID_PROFILE', `${path}.uuid`, 'duplicate characteristic UUID in service');
  uuids.add(uuid);

  const operations = c.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    return invalid('INVALID_PROFILE', `${path}.operations`, 'must be a non-empty array');
  }
  const seen = new Set<string>();
  for (const operation of operations) {
    if (!PLUGIN_BLE_OPERATIONS.includes(operation as PluginBleOperation)) {
      return invalid('INVALID_PROFILE', `${path}.operations`, `unknown operation "${String(operation)}"`);
    }
    if (seen.has(operation))
      return invalid('INVALID_PROFILE', `${path}.operations`, `duplicate operation "${operation}"`);
    seen.add(operation);
  }
  const allows = (...ops: PluginBleOperation[]) => ops.some((op) => seen.has(op));
  const bound = (field: string, needed: boolean): number | undefined => {
    if (!needed) return undefined;
    if (c[field] === undefined)
      return invalid('INVALID_PROFILE', `${path}.${field}`, 'is required for the allowed operations');
    return boundedInteger(c[field], `${path}.${field}`, 1, PLUGIN_BLE_LIMITS.payloadMaxBytes, 'INVALID_PROFILE');
  };
  const maxReadBytes = bound('maxReadBytes', allows('read'));
  const maxWriteBytes = bound('maxWriteBytes', allows('write', 'writeWithoutResponse'));
  const maxNotificationBytes = bound('maxNotificationBytes', allows('notify', 'indicate'));

  const result: Record<string, unknown> = { key, uuid, operations: [...(operations as PluginBleOperation[])] };
  if (maxReadBytes !== undefined) result.maxReadBytes = maxReadBytes;
  if (maxWriteBytes !== undefined) result.maxWriteBytes = maxWriteBytes;
  if (maxNotificationBytes !== undefined) result.maxNotificationBytes = maxNotificationBytes;
  return result as unknown as PluginBleCharacteristic;
}

function normalizeAdvertisement(raw: unknown): PluginBleProfile['advertisement'] {
  if (raw === undefined) return undefined;
  const a = raw as Record<string, unknown> | null;
  if (typeof a !== 'object' || a === null) return invalid('INVALID_PROFILE', 'advertisement', 'must be an object');
  const uuids = a.serviceUuids === undefined ? [] : a.serviceUuids;
  if (!Array.isArray(uuids)) return invalid('INVALID_PROFILE', 'advertisement.serviceUuids', 'must be an array');
  const serviceUuids = uuids.map((uuid, index) => normalizeBleUuid(uuid, `advertisement.serviceUuids[${index}]`));
  if (new Set(serviceUuids).size !== serviceUuids.length) {
    return invalid('INVALID_PROFILE', 'advertisement.serviceUuids', 'contains a duplicate UUID');
  }
  const ids = a.manufacturerIds === undefined ? [] : a.manufacturerIds;
  if (!Array.isArray(ids)) return invalid('INVALID_PROFILE', 'advertisement.manufacturerIds', 'must be an array');
  const manufacturerIds = ids.map((id, index) =>
    boundedInteger(id, `advertisement.manufacturerIds[${index}]`, 0, 0xffff, 'INVALID_PROFILE'),
  );
  if (new Set(manufacturerIds).size !== manufacturerIds.length) {
    return invalid('INVALID_PROFILE', 'advertisement.manufacturerIds', 'contains a duplicate id');
  }
  let namePrefix: string | undefined;
  if (a.namePrefix !== undefined) {
    if (typeof a.namePrefix !== 'string' || a.namePrefix.length < 1 || a.namePrefix.length > MAX_NAME_PREFIX) {
      return invalid('INVALID_PROFILE', 'advertisement.namePrefix', `must be 1..${MAX_NAME_PREFIX} characters`);
    }
    namePrefix = a.namePrefix;
  }
  if (!serviceUuids.length && !manufacturerIds.length && namePrefix === undefined) {
    return invalid('INVALID_PROFILE', 'advertisement', 'needs serviceUuids, manufacturerIds or namePrefix');
  }
  return namePrefix === undefined ? { serviceUuids, manufacturerIds } : { serviceUuids, manufacturerIds, namePrefix };
}

export function deepFreezeBle<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreezeBle(child);
    Object.freeze(value);
  }
  return value;
}

/** Validates and normalizes a profile definition; the result is deep-frozen. */
export function normalizeBleProfile(definition: PluginBleProfileDefinition): PluginBleProfile {
  const def = definition as unknown as Record<string, unknown> | null;
  if (typeof def !== 'object' || def === null) return invalid('INVALID_PROFILE', 'profile', 'must be an object');
  const id = validateBleProfileId(def.id, 'id', 'INVALID_PROFILE');
  const advertisement = normalizeAdvertisement(def.advertisement);

  if (!Array.isArray(def.services) || def.services.length === 0) {
    return invalid('INVALID_PROFILE', 'services', 'needs at least one service');
  }
  const keys = new Set<string>();
  const serviceUuids = new Set<string>();
  const services = def.services.map((rawService: unknown, si: number) => {
    const path = `services[${si}]`;
    const s = rawService as Record<string, unknown> | null;
    if (typeof s !== 'object' || s === null) return invalid('INVALID_PROFILE', path, 'must be an object');
    const uuid = normalizeBleUuid(s.uuid, `${path}.uuid`);
    if (serviceUuids.has(uuid)) return invalid('INVALID_PROFILE', `${path}.uuid`, 'duplicate service UUID');
    serviceUuids.add(uuid);
    if (!Array.isArray(s.characteristics) || s.characteristics.length === 0) {
      return invalid('INVALID_PROFILE', `${path}.characteristics`, 'needs at least one characteristic');
    }
    const characteristicUuids = new Set<string>();
    const characteristics = s.characteristics.map((c: unknown, ci: number) =>
      normalizeCharacteristic(c, `${path}.characteristics[${ci}]`, keys, characteristicUuids),
    );
    return { uuid, characteristics };
  });

  const rawLimits = (def.limits ?? {}) as Record<string, unknown>;
  if (typeof rawLimits !== 'object' || rawLimits === null)
    return invalid('INVALID_PROFILE', 'limits', 'must be an object');
  const maxSessionMs =
    rawLimits.maxSessionMs === undefined
      ? PLUGIN_BLE_LIMITS.leaseDefaultMs
      : boundedInteger(
          rawLimits.maxSessionMs,
          'limits.maxSessionMs',
          1,
          PLUGIN_BLE_LIMITS.leaseMaxMs,
          'INVALID_PROFILE',
        );
  const maxNotificationQueue =
    rawLimits.maxNotificationQueue === undefined
      ? PLUGIN_BLE_LIMITS.notificationQueueDefault
      : boundedInteger(
          rawLimits.maxNotificationQueue,
          'limits.maxNotificationQueue',
          1,
          PLUGIN_BLE_LIMITS.notificationQueueMax,
          'INVALID_PROFILE',
        );

  const profile: Record<string, unknown> = { id };
  if (advertisement) profile.advertisement = advertisement;
  profile.services = services;
  profile.limits = { maxSessionMs, maxNotificationQueue };
  return deepFreezeBle(profile as unknown as PluginBleProfile);
}

export function bleProfilesEqual(a: PluginBleProfile, b: PluginBleProfile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function findBleCharacteristic(
  profile: PluginBleProfile,
  key: string,
): { serviceUuid: string; characteristic: PluginBleCharacteristic } | undefined {
  for (const service of profile.services) {
    const characteristic = service.characteristics.find((candidate) => candidate.key === key);
    if (characteristic) return { serviceUuid: service.uuid, characteristic };
  }
  return undefined;
}

export interface BleCharacteristicTarget {
  serviceUuid: string;
  characteristic: PluginBleCharacteristic;
}

function requireBleKey(profile: PluginBleProfile, key: unknown, operation: string): BleCharacteristicTarget {
  if (typeof key !== 'string') return invalid('INVALID_ARGUMENT', 'key', 'must be a profile characteristic key');
  const target = findBleCharacteristic(profile, key);
  if (!target) {
    throw new PluginBleError(
      'UNKNOWN_CHARACTERISTIC',
      `Unknown characteristic key "${key}" in profile "${profile.id}"`,
      {
        operation,
        detail: key,
      },
    );
  }
  return target;
}

function requireOperation(target: BleCharacteristicTarget, operation: PluginBleOperation, label: string) {
  if (!target.characteristic.operations.includes(operation)) {
    throw new PluginBleError(
      'OPERATION_NOT_ALLOWED',
      `Characteristic "${target.characteristic.key}" does not allow "${operation}"`,
      { operation: label, detail: target.characteristic.key },
    );
  }
}

export function prepareBleRead(profile: PluginBleProfile, key: unknown): BleCharacteristicTarget {
  const target = requireBleKey(profile, key, 'read');
  requireOperation(target, 'read', 'read');
  return target;
}

export function prepareBleWrite(
  profile: PluginBleProfile,
  key: unknown,
  value: unknown,
  withoutResponse = false,
): BleCharacteristicTarget & { value: Uint8Array; withoutResponse: boolean } {
  const target = requireBleKey(profile, key, 'write');
  requireOperation(target, withoutResponse ? 'writeWithoutResponse' : 'write', 'write');
  if (!isBleBytes(value)) return invalid('INVALID_ARGUMENT', 'value', 'must be a Uint8Array');
  if (value.byteLength === 0) return invalid('INVALID_ARGUMENT', 'value', 'must not be empty');
  const max = target.characteristic.maxWriteBytes ?? 0;
  if (value.byteLength > max) {
    throw new PluginBleError('PAYLOAD_TOO_LARGE', `Write to "${target.characteristic.key}" exceeds ${max} bytes`, {
      operation: 'write',
      detail: `${value.byteLength} > ${max} bytes`,
    });
  }
  // Copy so the plugin cannot change the bytes after validation.
  return { ...target, value: Uint8Array.from(value), withoutResponse };
}

export function prepareBleSubscribe(
  profile: PluginBleProfile,
  key: unknown,
): BleCharacteristicTarget & { indicate: boolean } {
  const target = requireBleKey(profile, key, 'subscribe');
  const ops = target.characteristic.operations;
  if (!ops.includes('notify') && !ops.includes('indicate')) {
    requireOperation(target, 'notify', 'subscribe');
  }
  return { ...target, indicate: !ops.includes('notify') };
}

/** Rejects a read result or notification above the profile bound. Returns a private copy of the bytes. */
export function checkBleInboundPayload(
  characteristic: PluginBleCharacteristic,
  kind: 'read' | 'notification',
  value: Uint8Array,
): Uint8Array {
  const max = (kind === 'read' ? characteristic.maxReadBytes : characteristic.maxNotificationBytes) ?? 0;
  if (value.byteLength > max) {
    throw new PluginBleError('PAYLOAD_TOO_LARGE', `A ${kind} from "${characteristic.key}" exceeds ${max} bytes`, {
      operation: kind,
      detail: `${value.byteLength} > ${max} bytes`,
    });
  }
  return Uint8Array.from(value);
}

export function resolveBleTimeout(value: unknown, defaultMs: number, maxMs: number, field = 'timeoutMs'): number {
  if (value === undefined) return defaultMs;
  return boundedInteger(value, field, 1, maxMs, 'INVALID_ARGUMENT');
}

export function resolveBleScanDuration(value: unknown): number {
  return resolveBleTimeout(value, PLUGIN_BLE_LIMITS.scanDefaultMs, PLUGIN_BLE_LIMITS.scanMaxMs, 'durationMs');
}

export function resolveBleSessionOptions(
  profile: PluginBleProfile,
  options: { leaseMs?: unknown; connectTimeoutMs?: unknown } | undefined,
): { leaseMs: number; connectTimeoutMs: number } {
  const cap = profile.limits.maxSessionMs;
  return {
    leaseMs: resolveBleTimeout(options?.leaseMs, Math.min(PLUGIN_BLE_LIMITS.leaseDefaultMs, cap), cap, 'leaseMs'),
    connectTimeoutMs: resolveBleTimeout(
      options?.connectTimeoutMs,
      PLUGIN_BLE_LIMITS.connectTimeoutDefaultMs,
      PLUGIN_BLE_LIMITS.connectTimeoutMaxMs,
      'connectTimeoutMs',
    ),
  };
}

function normalizeLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > PLUGIN_BLE_LIMITS.labelMaxLength) {
    return invalid(
      'INVALID_ARGUMENT',
      'label',
      `must be a string of at most ${PLUGIN_BLE_LIMITS.labelMaxLength} characters`,
    );
  }
  return value;
}

export function normalizeBleEndpointInput(input: PluginBleEndpointInput) {
  if (typeof input !== 'object' || input === null) return invalid('INVALID_ARGUMENT', 'input', 'must be an object');
  return {
    readerId: validateBleReaderId(input.readerId),
    address: normalizeBleAddress(input.address),
    addressType: normalizeBleAddressType(input.addressType),
    profileId: validateBleProfileId(input.profileId),
    label: normalizeLabel(input.label),
  };
}

export function normalizeBleEndpointUpdate(update: PluginBleEndpointUpdate): {
  readerId?: number;
  address?: string;
  addressType?: PluginBleAddressType;
  label?: string | null;
} {
  if (typeof update !== 'object' || update === null) return invalid('INVALID_ARGUMENT', 'update', 'must be an object');
  if ('profileId' in update) return invalid('INVALID_ARGUMENT', 'profileId', 'is immutable');
  const result: ReturnType<typeof normalizeBleEndpointUpdate> = {};
  if (update.readerId !== undefined) result.readerId = validateBleReaderId(update.readerId);
  if (update.address !== undefined) result.address = normalizeBleAddress(update.address);
  if (update.addressType !== undefined) result.addressType = normalizeBleAddressType(update.addressType);
  if (update.label !== undefined) result.label = normalizeLabel(update.label);
  return result;
}

export function validateBleEndpointId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    return invalid('INVALID_ARGUMENT', 'endpointId', 'must be an endpoint id string');
  }
  return value;
}

/** Normalizes a raw advertisement coming from a driver (address, UUIDs, private byte copies). */
export function normalizeBleAdvertisement(raw: PluginBleAdvertisement): PluginBleAdvertisement {
  const result: PluginBleAdvertisement = {
    address: normalizeBleAddress(raw.address, 'advertisement.address'),
    addressType: normalizeBleAddressType(raw.addressType, 'advertisement.addressType'),
    serviceUuids: (raw.serviceUuids ?? []).map((uuid) =>
      normalizeBleUuid(uuid, 'advertisement.serviceUuids', 'INVALID_ARGUMENT'),
    ),
    manufacturerData: (raw.manufacturerData ?? []).map((entry) => ({
      companyId: entry.companyId,
      data: Uint8Array.from(entry.data),
    })),
  };
  if (raw.rssi !== undefined) result.rssi = raw.rssi;
  if (raw.name !== undefined) result.name = raw.name;
  return result;
}

/**
 * True when the advertisement matches every criterion the profile filter sets: any of its service UUIDs, any of
 * its manufacturer ids, and the name prefix. A profile without a filter matches nothing.
 */
export function matchesBleAdvertisement(profile: PluginBleProfile, advertisement: PluginBleAdvertisement): boolean {
  const filter = profile.advertisement;
  if (!filter) return false;
  if (filter.serviceUuids.length && !advertisement.serviceUuids.some((uuid) => filter.serviceUuids.includes(uuid))) {
    return false;
  }
  if (
    filter.manufacturerIds.length &&
    !advertisement.manufacturerData.some((entry) => filter.manufacturerIds.includes(entry.companyId))
  ) {
    return false;
  }
  if (filter.namePrefix !== undefined && !(advertisement.name ?? '').startsWith(filter.namePrefix)) return false;
  return true;
}

/** Wraps anything that is not a `PluginBleError` in `INTERNAL` without copying its message (it may carry data). */
export function toBleError(error: unknown, operation: string): PluginBleError {
  if (error instanceof PluginBleError) return error;
  const name = error instanceof Error ? error.name : typeof error;
  return new PluginBleError('INTERNAL', `Unexpected ${operation} failure`, { operation, detail: name });
}

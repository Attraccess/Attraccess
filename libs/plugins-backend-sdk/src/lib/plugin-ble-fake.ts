import { randomUUID } from 'crypto';
import {
  PluginBleAddressType,
  PluginBleAdvertisement,
  PluginBleContext,
  PluginBleEndpoint,
  PluginBleError,
  PluginBleErrorCode,
  PluginBleCloseReason,
  PluginBleProfile,
  PluginBleSession,
} from './plugin-ble';
import { FakeBleClock } from './plugin-ble-fake-clock';
import { BleSessionEngine, BleSessionLink } from './plugin-ble-session-engine';
import {
  bleProfilesEqual,
  matchesBleAdvertisement,
  normalizeBleAddress,
  normalizeBleAddressType,
  normalizeBleAdvertisement,
  normalizeBleEndpointInput,
  normalizeBleEndpointUpdate,
  normalizeBleProfile,
  normalizeBleUuid,
  resolveBleScanDuration,
  resolveBleSessionOptions,
  validateBleEndpointId,
  validateBleProfileId,
  validateBleReaderId,
} from './plugin-ble-validation';

/**
 * Deterministic fake of the host BLE transport for plugin unit and integration tests. It has no Nest, database
 * or network dependency, enforces the same validation and error codes as the host, and moves time only when a
 * test calls `advance`.
 */

export type FakeBleOperation = 'scan' | 'connect' | 'disconnect' | 'read' | 'write' | 'subscribe' | 'unsubscribe';

export interface FakeBleCharacteristic {
  /** Current value returned by reads (and updated by writes without an `onWrite`). */
  value?: Uint8Array;
  onRead?: () => Uint8Array | Promise<Uint8Array>;
  onWrite?: (value: Uint8Array, options: { withoutResponse: boolean }) => void | Promise<void>;
  /** Answers only after this many ms of fake time. Use it to provoke timeouts. */
  delayMs?: number;
}

export interface FakeBlePeripheral {
  readerId?: number;
  readerIds?: number[];
  address: string;
  addressType: PluginBleAddressType;
  advertisement: {
    name?: string;
    rssi?: number;
    serviceUuids?: string[];
    manufacturerData?: Array<{ companyId: number; data: Uint8Array }>;
  };
  /** Keyed by characteristic UUID (any accepted form). */
  characteristics?: Record<string, FakeBleCharacteristic>;
}

export interface FakeBleReaderInput {
  readerId: number;
  name: string;
  /** Default false, like production. */
  allowPluginBle?: boolean;
  /** Default true. */
  available?: boolean;
}

/** One validated primitive that reached the (fake) transport. */
export interface FakeBleTranscriptEntry {
  op: FakeBleOperation;
  readerId: number;
  address?: string;
  addressType?: PluginBleAddressType;
  serviceUuid?: string;
  characteristicUuid?: string;
  bytes?: Uint8Array;
  withoutResponse?: boolean;
  durationMs?: number;
  indicate?: boolean;
}

export interface FakeBleOpenSession {
  id: string;
  pluginId: string;
  endpointId: string;
  readerId: number;
  address: string;
}

export interface FakeBleHostOptions {
  /** Default true. Use false to simulate calls before the host finished bootstrapping (`NOT_READY`). */
  ready?: boolean;
  /** Wall-clock start of the fake clock (ms since 1970). Default 2026-01-01T00:00:00Z. */
  startTime?: number;
  /** ATT MTU every new connection negotiates, clamped to 23..517. Default 247. */
  mtu?: number;
}

/** The MTU the fake negotiates unless a test sets another one. */
export const FAKE_BLE_DEFAULT_MTU = 247;

export interface FakeBleHost {
  contextFor(pluginId: string): PluginBleContext;
  addReader(reader: FakeBleReaderInput): void;
  removeReader(readerId: number): Promise<void>;
  setReaderAccess(readerId: number, allowed: boolean): Promise<void>;
  setReaderAvailable(readerId: number, available: boolean): void;
  /** `false` simulates reader firmware without plugin BLE support (`READER_UNSUPPORTED` with `detail`). */
  setReaderSupported(readerId: number, supported: boolean, detail?: string): void;
  /** `false` simulates a host without a transport driver (`TRANSPORT_UNAVAILABLE`). */
  setTransportAvailable(available: boolean): void;
  setReady(ready: boolean): void;
  addPeripheral(peripheral: FakeBlePeripheral): void;
  notify(address: string, uuid: string, bytes: Uint8Array): void;
  /** The peripheral drops the link: sessions to it close with `disconnected`. */
  disconnect(address: string): Promise<void>;
  /** ATT MTU for connections opened from now on, clamped to 23..517. */
  setMtu(mtu: number): void;
  /** Makes the next occurrence of `op` fail with `code`. */
  failNext(op: FakeBleOperation, code: PluginBleErrorCode, options?: { detail?: string }): void;
  advance(ms: number): Promise<void>;
  /** Simulates the plugin module being destroyed: closes its sessions with `shutdown`. */
  shutdownPlugin(pluginId: string): Promise<void>;
  /** Simulates plugin uninstall: closes its sessions and deletes its endpoints. */
  uninstallPlugin(pluginId: string): Promise<void>;
  readonly transcript: FakeBleTranscriptEntry[];
  openSessions(): FakeBleOpenSession[];
}

interface StoredEndpoint extends PluginBleEndpoint {
  pluginId: string;
}

interface SessionEntry {
  session: BleSessionEngine;
  pluginId: string;
  endpoint: StoredEndpoint;
}

const notReady = () =>
  new PluginBleError('NOT_READY', 'The host is not ready yet; retry after bootstrap completed', {
    detail: 'bootstrap',
  });

function copyEndpoint(endpoint: StoredEndpoint): PluginBleEndpoint {
  return {
    id: endpoint.id,
    readerId: endpoint.readerId,
    address: endpoint.address,
    addressType: endpoint.addressType,
    profileId: endpoint.profileId,
    label: endpoint.label,
    createdAt: new Date(endpoint.createdAt),
    updatedAt: new Date(endpoint.updatedAt),
  };
}

export function createFakeBleHost(options: FakeBleHostOptions = {}): FakeBleHost {
  const clock = new FakeBleClock(options.startTime ?? Date.UTC(2026, 0, 1));
  const transcript: FakeBleTranscriptEntry[] = [];
  const readers = new Map<number, { name: string; allow: boolean; available: boolean; unsupported?: string }>();
  const peripherals = new Map<
    string,
    {
      readerIds: Set<number>;
      addressType: PluginBleAddressType;
      advertisement: FakeBlePeripheral['advertisement'];
      characteristics: Map<string, FakeBleCharacteristic>;
    }
  >();
  const profiles = new Map<string, Map<string, PluginBleProfile>>();
  const endpoints = new Map<string, StoredEndpoint>();
  const sessions = new Map<string, SessionEntry>();
  // Per address, the notification routes of every link to it (one per session, also across readers).
  const links = new Map<string, Set<Map<string, (bytes: Uint8Array) => void>>>();
  const failures = new Map<FakeBleOperation, PluginBleError[]>();
  let ready = options.ready ?? true;
  let transportAvailable = true;
  let mtu = options.mtu ?? FAKE_BLE_DEFAULT_MTU;

  const record = (entry: FakeBleTranscriptEntry) => {
    transcript.push(entry);
    const failure = failures.get(entry.op)?.shift();
    if (failure) throw failure;
  };

  const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new PluginBleError('CANCELLED', 'cancelled'));
      const cancel = clock.setTimeout(() => (signal.removeEventListener('abort', onAbort), resolve()), ms);
      const onAbort = () => (cancel(), reject(new PluginBleError('CANCELLED', 'cancelled')));
      signal.addEventListener('abort', onAbort, { once: true });
    });

  const closeWhere = (predicate: (entry: SessionEntry) => boolean, reason: PluginBleCloseReason) =>
    Promise.all([...sessions.values()].filter(predicate).map((entry) => entry.session.close(reason))).then(
      () => undefined,
    );

  const requireReader = (readerId: number) => {
    const reader = readers.get(readerId);
    if (!reader)
      throw new PluginBleError('READER_NOT_FOUND', `Reader ${readerId} does not exist`, { detail: 'readerId' });
    if (!reader.allow) {
      throw new PluginBleError('READER_ACCESS_DENIED', `Reader ${readerId} is not open for plugins`, {
        detail: 'readerId',
      });
    }
    return reader;
  };

  const requireTransport = (readerId: number) => {
    const reader = requireReader(readerId);
    if (!transportAvailable) throw new PluginBleError('TRANSPORT_UNAVAILABLE', 'No BLE transport is available');
    if (!reader.available) throw new PluginBleError('READER_OFFLINE', `Reader ${readerId} cannot do BLE right now`);
    if (reader.unsupported !== undefined) {
      throw new PluginBleError('READER_UNSUPPORTED', `The firmware of reader ${readerId} cannot do plugin BLE`, {
        detail: reader.unsupported,
      });
    }
  };

  const createLink = (readerId: number, address: string): BleSessionLink => {
    const peripheral = peripherals.get(address);
    if (!peripheral) throw new PluginBleError('DEVICE_NOT_FOUND', 'The device was not found near the reader');
    const subscribers = new Map<string, (bytes: Uint8Array) => void>();
    const routes = links.get(address) ?? new Set();
    routes.add(subscribers);
    links.set(address, routes);
    const characteristic = (uuid: string) => {
      const found = peripheral.characteristics.get(uuid);
      if (!found)
        throw new PluginBleError('GATT_ERROR', 'Characteristic not found on the device', { detail: 'not-found' });
      return found;
    };
    const delayed = async (spec: FakeBleCharacteristic, signal: AbortSignal) => {
      if (spec.delayMs) await sleep(spec.delayMs, signal);
    };
    return {
      mtu,
      async read({ serviceUuid, characteristicUuid, signal }) {
        record({ op: 'read', readerId, address, serviceUuid, characteristicUuid });
        const spec = characteristic(characteristicUuid);
        await delayed(spec, signal);
        return spec.onRead ? spec.onRead() : (spec.value ?? new Uint8Array());
      },
      async write({ serviceUuid, characteristicUuid, value, withoutResponse, signal }) {
        record({ op: 'write', readerId, address, serviceUuid, characteristicUuid, bytes: value, withoutResponse });
        const spec = characteristic(characteristicUuid);
        await delayed(spec, signal);
        if (spec.onWrite) await spec.onWrite(value, { withoutResponse });
        else spec.value = Uint8Array.from(value);
      },
      async subscribe({ serviceUuid, characteristicUuid, indicate, signal, onNotification }) {
        record({ op: 'subscribe', readerId, address, serviceUuid, characteristicUuid, indicate });
        await delayed(characteristic(characteristicUuid), signal);
        subscribers.set(characteristicUuid, onNotification);
      },
      async unsubscribe({ serviceUuid, characteristicUuid }) {
        record({ op: 'unsubscribe', readerId, address, serviceUuid, characteristicUuid });
        subscribers.delete(characteristicUuid);
      },
      async disconnect() {
        links.get(address)?.delete(subscribers);
        record({ op: 'disconnect', readerId, address });
      },
    };
  };

  const findEndpoint = (pluginId: string, id: unknown): StoredEndpoint => {
    const endpoint = endpoints.get(validateBleEndpointId(id));
    // Another plugin's endpoint looks exactly like a missing one.
    if (!endpoint || endpoint.pluginId !== pluginId) {
      throw new PluginBleError('ENDPOINT_NOT_FOUND', 'Endpoint not found', { detail: 'endpointId' });
    }
    return endpoint;
  };

  const requireProfile = (pluginId: string, profileId: string): PluginBleProfile => {
    const profile = profiles.get(pluginId)?.get(profileId);
    if (!profile) {
      throw new PluginBleError('PROFILE_NOT_REGISTERED', `Profile "${profileId}" is not registered by this plugin`, {
        detail: profileId,
      });
    }
    return profile;
  };

  const assertNoConflict = (pluginId: string, readerId: number, address: string, ignoreId?: string) => {
    for (const other of endpoints.values()) {
      if (other.id === ignoreId || other.address !== address) continue;
      if (other.pluginId !== pluginId || other.readerId === readerId) {
        throw new PluginBleError('ENDPOINT_CONFLICT', 'This device address is already bound', { detail: 'address' });
      }
    }
  };

  const guard = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    if (!ready) throw notReady();
    return fn();
  };

  const abortIfNeeded = (signal: AbortSignal | undefined, operation: string) => {
    if (signal?.aborted) throw new PluginBleError('CANCELLED', `${operation} was cancelled`, { operation });
  };

  const openSession = (
    pluginId: string,
    endpointId: string,
    sessionOptions?: Parameters<PluginBleContext['openSession']>[1],
  ) =>
    guard(async (): Promise<PluginBleSession> => {
      const endpoint = findEndpoint(pluginId, endpointId);
      const profile = requireProfile(pluginId, endpoint.profileId);
      const resolved = resolveBleSessionOptions(profile, sessionOptions);
      abortIfNeeded(sessionOptions?.signal, 'openSession');
      requireTransport(endpoint.readerId);
      if (sessions.has(endpoint.id)) {
        throw new PluginBleError('ENDPOINT_BUSY', 'The endpoint already has an open session', { detail: endpoint.id });
      }
      const session: BleSessionEngine = new BleSessionEngine({
        id: randomUUID(),
        endpointId: endpoint.id,
        profile,
        clock,
        onClosed: () => {
          if (sessions.get(endpoint.id)?.session === session) sessions.delete(endpoint.id);
        },
        connect: async (signal) => {
          record({
            op: 'connect',
            readerId: endpoint.readerId,
            address: endpoint.address,
            addressType: endpoint.addressType,
          });
          const peripheral = peripherals.get(endpoint.address);
          if (!peripheral || !peripheral.readerIds.has(endpoint.readerId)) {
            throw new PluginBleError('DEVICE_NOT_FOUND', 'The device was not found near the reader');
          }
          if (signal.aborted) throw new PluginBleError('CANCELLED', 'cancelled');
          return createLink(endpoint.readerId, endpoint.address);
        },
      });
      // A snapshot: the session stays bound to the reader and address it was opened on.
      sessions.set(endpoint.id, { session, pluginId, endpoint: { ...endpoint } });
      await session.open({ signal: sessionOptions?.signal, ...resolved });
      return session.handle;
    });

  const host: FakeBleHost = {
    transcript,
    contextFor(pluginId) {
      return {
        registerProfile(definition) {
          const profile = normalizeBleProfile(definition);
          const own = profiles.get(pluginId) ?? new Map<string, PluginBleProfile>();
          profiles.set(pluginId, own);
          const existing = own.get(profile.id);
          if (!existing) {
            own.set(profile.id, profile);
            return profile;
          }
          if (!bleProfilesEqual(existing, profile)) {
            throw new PluginBleError('PROFILE_CONFLICT', `Profile "${profile.id}" is already registered differently`, {
              detail: profile.id,
            });
          }
          return existing;
        },
        listReaders: () =>
          guard(() =>
            [...readers.entries()]
              .filter(([, reader]) => reader.allow)
              .map(([readerId, reader]) => ({
                readerId,
                name: reader.name,
                available: transportAvailable && reader.available && reader.unsupported === undefined,
              })),
          ),
        scan: (readerId, profileId, scanOptions) =>
          guard(() => {
            validateBleReaderId(readerId);
            const profile = requireProfile(pluginId, validateBleProfileId(profileId));
            const durationMs = resolveBleScanDuration(scanOptions?.durationMs);
            if (!profile.advertisement) {
              throw new PluginBleError('OPERATION_NOT_ALLOWED', `Profile "${profile.id}" has no advertisement filter`, {
                operation: 'scan',
              });
            }
            requireTransport(readerId);
            abortIfNeeded(scanOptions?.signal, 'scan');
            record({ op: 'scan', readerId, durationMs });
            const found: PluginBleAdvertisement[] = [];
            for (const [address, peripheral] of peripherals) {
              if (!peripheral.readerIds.has(readerId)) continue;
              const advertisement = normalizeBleAdvertisement({
                address,
                addressType: peripheral.addressType,
                rssi: peripheral.advertisement.rssi,
                name: peripheral.advertisement.name,
                serviceUuids: peripheral.advertisement.serviceUuids ?? [],
                manufacturerData: peripheral.advertisement.manufacturerData ?? [],
              });
              if (matchesBleAdvertisement(profile, advertisement)) found.push(advertisement);
            }
            return found;
          }),
        createEndpoint: (input) =>
          guard(() => {
            const normalized = normalizeBleEndpointInput(input);
            requireProfile(pluginId, normalized.profileId);
            requireReader(normalized.readerId);
            assertNoConflict(pluginId, normalized.readerId, normalized.address);
            const now = new Date(clock.now());
            const endpoint: StoredEndpoint = {
              id: randomUUID(),
              pluginId,
              ...normalized,
              createdAt: now,
              updatedAt: now,
            };
            endpoints.set(endpoint.id, endpoint);
            return copyEndpoint(endpoint);
          }),
        getEndpoint: (id) => guard(() => copyEndpoint(findEndpoint(pluginId, id))),
        listEndpoints: () =>
          guard(() => [...endpoints.values()].filter((endpoint) => endpoint.pluginId === pluginId).map(copyEndpoint)),
        updateEndpoint: (id, update) =>
          guard(async () => {
            const endpoint = findEndpoint(pluginId, id);
            const changes = normalizeBleEndpointUpdate(update);
            const readerId = changes.readerId ?? endpoint.readerId;
            const address = changes.address ?? endpoint.address;
            if (changes.readerId !== undefined) requireReader(readerId);
            assertNoConflict(pluginId, readerId, address, endpoint.id);
            const moved =
              readerId !== endpoint.readerId ||
              address !== endpoint.address ||
              (changes.addressType ?? endpoint.addressType) !== endpoint.addressType;
            // Changed first, then closed, like the host: an open racing this sees the new endpoint.
            Object.assign(endpoint, changes, { updatedAt: new Date(clock.now()) });
            if (moved) await closeWhere((entry) => entry.endpoint.id === endpoint.id, 'endpoint-deleted');
            return copyEndpoint(endpoint);
          }),
        deleteEndpoint: (id) =>
          guard(async () => {
            const endpoint = findEndpoint(pluginId, id);
            endpoints.delete(endpoint.id);
            await closeWhere((entry) => entry.endpoint.id === endpoint.id, 'endpoint-deleted');
          }),
        openSession: (endpointId, sessionOptions) => openSession(pluginId, endpointId, sessionOptions),
        async withSession(endpointId, fn, sessionOptions) {
          const session = await openSession(pluginId, endpointId, sessionOptions);
          try {
            return await fn(session);
          } finally {
            await session.close();
          }
        },
      };
    },
    addReader(reader) {
      readers.set(validateBleReaderId(reader.readerId), {
        name: reader.name,
        allow: reader.allowPluginBle ?? false,
        available: reader.available ?? true,
      });
    },
    async removeReader(readerId) {
      readers.delete(readerId);
      await closeWhere((entry) => entry.endpoint.readerId === readerId, 'reader-access-revoked');
      for (const endpoint of [...endpoints.values()]) if (endpoint.readerId === readerId) endpoints.delete(endpoint.id);
    },
    async setReaderAccess(readerId, allowed) {
      const reader = readers.get(readerId);
      if (reader) reader.allow = allowed;
      if (!allowed) await closeWhere((entry) => entry.endpoint.readerId === readerId, 'reader-access-revoked');
    },
    setReaderAvailable(readerId, available) {
      const reader = readers.get(readerId);
      if (reader) reader.available = available;
    },
    setReaderSupported(readerId, supported, detail = 'no-ble-capability') {
      const reader = readers.get(readerId);
      if (reader) reader.unsupported = supported ? undefined : detail;
    },
    setTransportAvailable(available) {
      transportAvailable = available;
    },
    setReady(value) {
      ready = value;
    },
    addPeripheral(peripheral) {
      const readerIds = new Set(
        peripheral.readerIds ?? (peripheral.readerId === undefined ? [] : [peripheral.readerId]),
      );
      const characteristics = new Map<string, FakeBleCharacteristic>();
      for (const [uuid, spec] of Object.entries(peripheral.characteristics ?? {})) {
        characteristics.set(normalizeBleUuid(uuid, 'characteristics', 'INVALID_ARGUMENT'), { ...spec });
      }
      peripherals.set(normalizeBleAddress(peripheral.address), {
        readerIds,
        addressType: normalizeBleAddressType(peripheral.addressType),
        advertisement: peripheral.advertisement,
        characteristics,
      });
    },
    notify(address, uuid, bytes) {
      const characteristicUuid = normalizeBleUuid(uuid, 'uuid', 'INVALID_ARGUMENT');
      for (const routes of [...(links.get(normalizeBleAddress(address)) ?? [])]) {
        routes.get(characteristicUuid)?.(Uint8Array.from(bytes));
      }
    },
    disconnect: (address) => {
      const normalized = normalizeBleAddress(address);
      links.delete(normalized);
      return closeWhere((entry) => entry.endpoint.address === normalized, 'disconnected');
    },
    setMtu(value) {
      mtu = value;
    },
    failNext(op, code, failOptions = {}) {
      const queue = failures.get(op) ?? [];
      queue.push(new PluginBleError(code, `Injected ${code} failure`, { operation: op, detail: failOptions.detail }));
      failures.set(op, queue);
    },
    advance: (ms) => clock.advance(ms),
    shutdownPlugin: (pluginId) => closeWhere((entry) => entry.pluginId === pluginId, 'shutdown'),
    async uninstallPlugin(pluginId) {
      await closeWhere((entry) => entry.pluginId === pluginId, 'endpoint-deleted');
      for (const endpoint of [...endpoints.values()]) if (endpoint.pluginId === pluginId) endpoints.delete(endpoint.id);
    },
    openSessions: () =>
      [...sessions.values()].map(({ session, pluginId, endpoint }) => ({
        id: session.id,
        pluginId,
        endpointId: endpoint.id,
        readerId: endpoint.readerId,
        address: endpoint.address,
      })),
  };
  return host;
}

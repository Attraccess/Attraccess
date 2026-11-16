import type { FakeBleHost } from './plugin-ble-fake';
import type {
  PluginBleCloseReason,
  PluginBleContext,
  PluginBleProfileDefinition,
  PluginBleSession,
} from './plugin-ble';

/**
 * One contract suite, two implementations: the SDK fake and the host service (with a test driver). Both must give
 * the same results and the same error codes, so a plugin tested against the fake behaves the same in the host.
 */
export interface BleContractSubject {
  host: FakeBleHost;
  dispose(): Promise<void>;
}

export type BleContractFactory = (options?: { ready?: boolean }) => Promise<BleContractSubject>;

export const SERVICE = 'fff0';
export const ADDRESS = 'aa:bb:cc:dd:ee:01';
export const NORMALIZED = 'AA:BB:CC:DD:EE:01';

export const PROFILE: PluginBleProfileDefinition = {
  id: 'demo-device',
  advertisement: { serviceUuids: [SERVICE], namePrefix: 'Demo' },
  services: [
    {
      uuid: SERVICE,
      characteristics: [
        { key: 'info', uuid: 'fff1', operations: ['read', 'write'], maxReadBytes: 16, maxWriteBytes: 8 },
        { key: 'events', uuid: 'fff2', operations: ['notify'], maxNotificationBytes: 8 },
        { key: 'bulk', uuid: 'fff3', operations: ['writeWithoutResponse'], maxWriteBytes: 20 },
        { key: 'slow', uuid: 'fff4', operations: ['read'], maxReadBytes: 4 },
      ],
    },
  ],
  limits: { maxSessionMs: 60_000, maxNotificationQueue: 2 },
};

export const bytes = (...values: number[]) => Uint8Array.from(values);
export const capture = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: { code?: string; retryable?: boolean; message?: string }) => ({ ok: false as const, error }),
  );

/** Readers 1 and 2 (opted in) and 3 (not), the demo device near readers 1 and 2, and plugin A's profile. */
export async function seedBleContract(host: FakeBleHost, a: PluginBleContext): Promise<void> {
  await host.addReader({ readerId: 1, name: 'Workshop', allowPluginBle: true });
  await host.addReader({ readerId: 2, name: 'Office', allowPluginBle: true });
  await host.addReader({ readerId: 3, name: 'Closed', allowPluginBle: false });
  host.addPeripheral({
    readerIds: [1, 2],
    address: ADDRESS,
    addressType: 'public',
    advertisement: { name: 'Demo lock', rssi: -50, serviceUuids: [SERVICE] },
    characteristics: {
      fff1: { value: bytes(1, 2, 3) },
      fff2: {},
      fff3: {},
      fff4: { value: bytes(9), delayMs: 20_000 },
    },
  });
  host.addPeripheral({
    readerId: 1,
    address: '11:22:33:44:55:66',
    addressType: 'random',
    advertisement: { name: 'Other thing', serviceUuids: ['180f'] },
    characteristics: {},
  });
  a.registerProfile(PROFILE);
}

/** How often each transport primitive appears in the transcript. */
export const countOps = (host: FakeBleHost, op: string) => host.transcript.filter((entry) => entry.op === op).length;

export function defineBleContractSuite(name: string, create: BleContractFactory): void {
  describe(`plugin BLE contract: ${name}`, () => {
    let subject: BleContractSubject;
    let host: FakeBleHost;
    let a: PluginBleContext;
    let b: PluginBleContext;

    const endpoint = async (ctx = a, readerId = 1) =>
      ctx.createEndpoint({ readerId, address: ADDRESS, addressType: 'public', profileId: PROFILE.id, label: 'Door' });

    const ops = () => host.transcript.map((entry) => entry.op);
    const disconnects = () => countOps(host, 'disconnect');

    beforeEach(async () => {
      subject = await create();
      host = subject.host;
      a = host.contextFor('plugin-a');
      b = host.contextFor('plugin-b');
      await seedBleContract(host, a);
    });

    afterEach(async () => {
      await subject.dispose();
    });

    describe('profiles', () => {
      it('normalizes UUIDs, freezes the result and is idempotent', () => {
        const profile = a.registerProfile(PROFILE);
        expect(profile.services[0].uuid).toBe('0000fff0-0000-1000-8000-00805f9b34fb');
        expect(profile.services[0].characteristics[0].uuid).toBe('0000fff1-0000-1000-8000-00805f9b34fb');
        expect(Object.isFrozen(profile)).toBe(true);
        expect(Object.isFrozen(profile.services[0].characteristics[0].operations)).toBe(true);
        expect(a.registerProfile({ ...PROFILE })).toBe(profile);
      });

      it('rejects a different definition under an existing id', () => {
        expect(() => a.registerProfile({ ...PROFILE, limits: { maxSessionMs: 1000 } })).toThrow(
          expect.objectContaining({ code: 'PROFILE_CONFLICT' }),
        );
      });

      it.each([
        [
          'malformed uuid',
          'services[0].uuid',
          { services: [{ uuid: 'xyz', characteristics: PROFILE.services[0].characteristics }] },
        ],
        ['bad profile id', 'id', { id: 'Bad Id' }],
        ['no services', 'services', { services: [] }],
        [
          'duplicate key',
          'services[0].characteristics[1].key',
          {
            services: [
              {
                uuid: SERVICE,
                characteristics: [
                  { key: 'k', uuid: 'a001', operations: ['read'], maxReadBytes: 1 },
                  { key: 'k', uuid: 'a002', operations: ['read'], maxReadBytes: 1 },
                ],
              },
            ],
          },
        ],
        [
          'unknown operation',
          'services[0].characteristics[0].operations',
          { services: [{ uuid: SERVICE, characteristics: [{ key: 'k', uuid: 'a001', operations: ['erase'] }] }] },
        ],
        [
          'missing bound',
          'services[0].characteristics[0].maxWriteBytes',
          { services: [{ uuid: SERVICE, characteristics: [{ key: 'k', uuid: 'a001', operations: ['write'] }] }] },
        ],
        [
          'bound above 512',
          'services[0].characteristics[0].maxReadBytes',
          {
            services: [
              { uuid: SERVICE, characteristics: [{ key: 'k', uuid: 'a001', operations: ['read'], maxReadBytes: 513 }] },
            ],
          },
        ],
        [
          'out-of-range bound for an operation that is not allowed',
          'services[0].characteristics[0].maxWriteBytes',
          {
            services: [
              {
                uuid: SERVICE,
                characteristics: [
                  { key: 'k', uuid: 'a001', operations: ['read'], maxReadBytes: 4, maxWriteBytes: 513 },
                ],
              },
            ],
          },
        ],
        ['lease above the cap', 'limits.maxSessionMs', { limits: { maxSessionMs: 15 * 60_000 + 1 } }],
        ['queue above the cap', 'limits.maxNotificationQueue', { limits: { maxNotificationQueue: 257 } }],
      ])('rejects %s with INVALID_PROFILE naming the field (%s)', (_label, field, override) => {
        const definition = { ...PROFILE, id: 'other', ...override } as unknown as PluginBleProfileDefinition;
        expect(() => a.registerProfile(definition)).toThrow(
          expect.objectContaining({ code: 'INVALID_PROFILE', message: expect.stringContaining(field) }),
        );
      });

      it('registers the same profile whatever order operations and advertisement lists come in', () => {
        const characteristic = (operations: string[]) => ({
          key: 'k',
          uuid: 'a001',
          operations,
          maxReadBytes: 4,
          maxWriteBytes: 4,
          maxNotificationBytes: 4,
        });
        const define = (operations: string[], serviceUuids: string[], manufacturerIds: number[]) =>
          ({
            id: 'ordered',
            advertisement: { serviceUuids, manufacturerIds },
            services: [{ uuid: SERVICE, characteristics: [characteristic(operations)] }],
          }) as unknown as PluginBleProfileDefinition;
        const first = a.registerProfile(define(['write', 'notify', 'read'], ['fff0', '180f'], [2, 1]));
        expect(a.registerProfile(define(['read', 'write', 'notify'], ['180f', 'fff0'], [1, 2]))).toBe(first);
        expect(first.services[0].characteristics[0].operations).toEqual(['read', 'write', 'notify']);
        expect(() => a.registerProfile(define(['read', 'write'], ['180f', 'fff0'], [1, 2]))).toThrow(
          expect.objectContaining({ code: 'PROFILE_CONFLICT' }),
        );
      });

      it('keeps profiles per plugin', async () => {
        await expect(
          b.createEndpoint({ readerId: 1, address: ADDRESS, addressType: 'public', profileId: PROFILE.id }),
        ).rejects.toMatchObject({
          code: 'PROFILE_NOT_REGISTERED',
        });
      });
    });

    describe('readers and scan', () => {
      it('lists only opted-in readers', async () => {
        host.setReaderAvailable(2, false);
        await expect(a.listReaders()).resolves.toEqual([
          { readerId: 1, name: 'Workshop', available: true },
          { readerId: 2, name: 'Office', available: false },
        ]);
      });

      it('returns only advertisements matching the profile filter, normalized', async () => {
        const results = await a.scan(1, PROFILE.id);
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ address: NORMALIZED, addressType: 'public', rssi: -50, name: 'Demo lock' });
        expect(results[0].serviceUuids).toEqual(['0000fff0-0000-1000-8000-00805f9b34fb']);
        expect(host.transcript[0]).toMatchObject({ op: 'scan', readerId: 1, durationMs: 5000 });
      });

      it('refuses to scan without an advertisement filter, with a bad duration or on a closed reader', async () => {
        a.registerProfile({ ...PROFILE, id: 'quiet', advertisement: undefined });
        await expect(a.scan(1, 'quiet')).rejects.toMatchObject({ code: 'OPERATION_NOT_ALLOWED' });
        await expect(a.scan(1, PROFILE.id, { durationMs: 15_001 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        await expect(a.scan(3, PROFILE.id)).rejects.toMatchObject({ code: 'READER_ACCESS_DENIED' });
        await expect(a.scan(99, PROFILE.id)).rejects.toMatchObject({ code: 'READER_NOT_FOUND' });
        await expect(a.scan(1, 'missing')).rejects.toMatchObject({ code: 'PROFILE_NOT_REGISTERED' });
        expect(host.transcript).toHaveLength(0);
      });

      it('honours a signal that is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(a.scan(1, PROFILE.id, { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
        expect(host.transcript).toHaveLength(0);
      });

      it('reports TRANSPORT_UNAVAILABLE and available=false without a transport', async () => {
        host.setTransportAvailable(false);
        await expect(a.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'TRANSPORT_UNAVAILABLE', retryable: true });
        const created = await endpoint();
        await expect(a.openSession(created.id)).rejects.toMatchObject({ code: 'TRANSPORT_UNAVAILABLE' });
        expect((await a.listReaders()).every((reader) => !reader.available)).toBe(true);
        expect(host.transcript).toHaveLength(0);
      });

      it('reports READER_OFFLINE when the reader cannot do BLE', async () => {
        host.setReaderAvailable(1, false);
        await expect(a.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'READER_OFFLINE', retryable: true });
      });
    });

    describe('endpoints and ownership', () => {
      it('creates, gets, lists, updates and deletes own endpoints', async () => {
        const created = await endpoint();
        expect(created).toMatchObject({
          readerId: 1,
          address: NORMALIZED,
          addressType: 'public',
          profileId: 'demo-device',
          label: 'Door',
        });
        expect(typeof created.id).toBe('string');
        expect(created.createdAt).toBeInstanceOf(Date);
        await expect(a.getEndpoint(created.id)).resolves.toMatchObject({ id: created.id });
        await expect(a.listEndpoints()).resolves.toHaveLength(1);
        const updated = await a.updateEndpoint(created.id, { label: null });
        expect(updated.label).toBeNull();
        expect(updated.profileId).toBe('demo-device');
        await a.deleteEndpoint(created.id);
        await expect(a.getEndpoint(created.id)).rejects.toMatchObject({ code: 'ENDPOINT_NOT_FOUND' });
        await expect(a.listEndpoints()).resolves.toEqual([]);
      });

      it('makes another plugin’s endpoint look missing', async () => {
        const created = await endpoint();
        b.registerProfile({ ...PROFILE, id: 'b-profile' });
        expect(await b.listEndpoints()).toEqual([]);
        for (const attempt of [
          () => b.getEndpoint(created.id),
          () => b.updateEndpoint(created.id, { label: 'x' }),
          () => b.deleteEndpoint(created.id),
          () => b.openSession(created.id),
        ]) {
          await expect(attempt()).rejects.toMatchObject({ code: 'ENDPOINT_NOT_FOUND', retryable: false });
        }
        await expect(a.getEndpoint(created.id)).resolves.toBeDefined();
      });

      it('binds one address to one plugin, and once per reader', async () => {
        await endpoint();
        b.registerProfile(PROFILE);
        await expect(endpoint(b)).rejects.toMatchObject({ code: 'ENDPOINT_CONFLICT' });
        await expect(endpoint(a)).rejects.toMatchObject({ code: 'ENDPOINT_CONFLICT' });
        await expect(endpoint(a, 2)).resolves.toMatchObject({ readerId: 2 });
      });

      it('rejects readers that do not exist or are not opted in', async () => {
        await expect(endpoint(a, 3)).rejects.toMatchObject({ code: 'READER_ACCESS_DENIED' });
        await expect(endpoint(a, 99)).rejects.toMatchObject({ code: 'READER_NOT_FOUND' });
        const created = await endpoint();
        await expect(a.updateEndpoint(created.id, { readerId: 3 })).rejects.toMatchObject({
          code: 'READER_ACCESS_DENIED',
        });
      });

      it('validates input and keeps the profile immutable', async () => {
        await expect(
          a.createEndpoint({ readerId: 1, address: 'nope', addressType: 'public', profileId: 'demo-device' }),
        ).rejects.toMatchObject({
          code: 'INVALID_ARGUMENT',
          message: expect.stringContaining('address'),
        });
        await expect(
          a.createEndpoint({
            readerId: 1,
            address: ADDRESS,
            addressType: 'public',
            profileId: 'demo-device',
            label: 'x'.repeat(101),
          }),
        ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', message: expect.stringContaining('label') });
        const created = await endpoint();
        await expect(a.updateEndpoint(created.id, { profileId: 'other' } as never)).rejects.toMatchObject({
          code: 'INVALID_ARGUMENT',
        });
        await expect(a.updateEndpoint(created.id, { address: 'zz' })).rejects.toMatchObject({
          code: 'INVALID_ARGUMENT',
        });
      });
    });

    describe('sessions', () => {
      it('runs a complete transaction in order', async () => {
        const created = await endpoint();
        expect((await a.scan(1, PROFILE.id)).map((advertisement) => advertisement.address)).toEqual([NORMALIZED]);
        const session = await a.openSession(created.id);
        expect(session.endpointId).toBe(created.id);
        await expect(session.read('info')).resolves.toEqual(bytes(1, 2, 3));
        const stream = await session.subscribe('events');
        await session.write('info', bytes(7, 7));
        host.notify(ADDRESS, 'fff2', bytes(0xaa));
        const notification = await stream.next();
        expect(notification).toMatchObject({ key: 'events' });
        expect(notification.value).toEqual(bytes(0xaa));
        expect(notification.receivedAt).toBeInstanceOf(Date);
        await session.unsubscribe('events');
        await session.close();
        await session.close();
        await expect(session.closed).resolves.toEqual({ reason: 'closed' });
        expect(ops()).toEqual(['scan', 'connect', 'read', 'subscribe', 'write', 'unsubscribe', 'disconnect']);
        expect(host.transcript.find((entry) => entry.op === 'write')).toMatchObject({
          characteristicUuid: '0000fff1-0000-1000-8000-00805f9b34fb',
          withoutResponse: false,
        });
        expect(host.openSessions()).toEqual([]);
        await expect(session.read('info')).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
      });

      it('rejects bad keys, operations and payloads before anything reaches the transport', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const before = host.transcript.length;
        await expect(session.read('nope')).rejects.toMatchObject({ code: 'UNKNOWN_CHARACTERISTIC' });
        await expect(session.read('0000fff1-0000-1000-8000-00805f9b34fb')).rejects.toMatchObject({
          code: 'UNKNOWN_CHARACTERISTIC',
        });
        await expect(session.read('events')).rejects.toMatchObject({ code: 'OPERATION_NOT_ALLOWED' });
        await expect(session.write('slow', bytes(1))).rejects.toMatchObject({ code: 'OPERATION_NOT_ALLOWED' });
        await expect(session.write('info', bytes(1), { withoutResponse: true })).rejects.toMatchObject({
          code: 'OPERATION_NOT_ALLOWED',
        });
        await expect(session.write('bulk', bytes(1))).rejects.toMatchObject({ code: 'OPERATION_NOT_ALLOWED' });
        await expect(session.write('info', new Uint8Array(9))).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
        await expect(session.write('info', new Uint8Array(0))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        await expect(session.write('info', 'text' as never)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        await expect(session.subscribe('info')).rejects.toMatchObject({ code: 'OPERATION_NOT_ALLOWED' });
        await expect(session.read('info', { timeoutMs: 60_001 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        expect(host.transcript).toHaveLength(before);
        await session.write('bulk', bytes(1, 2, 3), { withoutResponse: true });
        expect(host.transcript[before]).toMatchObject({ op: 'write', withoutResponse: true });
        await session.close();
      });

      it('rejects reads and notifications above their bound', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        host.addPeripheral({
          readerIds: [1, 2],
          address: ADDRESS,
          addressType: 'public',
          advertisement: {},
          characteristics: { fff1: { value: new Uint8Array(17) }, fff2: {} },
        });
        await session.close();
        const again = await a.openSession(created.id);
        await expect(again.read('info')).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
        const stream = await again.subscribe('events');
        host.notify(ADDRESS, 'fff2', new Uint8Array(9));
        await expect(stream.next()).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
        await again.close();
      });

      it('times out an operation without closing the session', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const pending = capture(session.read('slow', { timeoutMs: 1000 }));
        await host.advance(999);
        await host.advance(1);
        await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT', retryable: true } });
        await expect(session.read('info')).resolves.toEqual(bytes(1, 2, 3));
        expect(host.openSessions()).toHaveLength(1);
        await session.close();
      });

      it('applies the default operation timeout of 10 seconds', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const pending = capture(session.read('slow'));
        await host.advance(9_999);
        await host.advance(1);
        await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
        await session.close();
      });

      it('cancels one call through its AbortSignal and keeps the session', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const controller = new AbortController();
        const pending = capture(session.read('slow', { signal: controller.signal }));
        await host.advance(1);
        controller.abort();
        await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED', retryable: false } });
        await expect(session.read('info')).resolves.toEqual(bytes(1, 2, 3));
        const early = new AbortController();
        early.abort();
        await expect(session.read('info', { signal: early.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
        await session.close();
      });

      it('closes the session when the open signal aborts', async () => {
        const created = await endpoint();
        const controller = new AbortController();
        const session = await a.openSession(created.id, { signal: controller.signal });
        const pending = capture(session.read('slow'));
        await host.advance(1);
        controller.abort();
        await expect(session.closed).resolves.toEqual({ reason: 'cancelled' });
        await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
        await expect(session.read('info')).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
        expect(disconnects()).toBe(1);
        expect(host.openSessions()).toEqual([]);
      });

      it('cancels a connect through the open signal', async () => {
        const created = await endpoint();
        const early = new AbortController();
        early.abort();
        await expect(a.openSession(created.id, { signal: early.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
        expect(host.transcript).toHaveLength(0);
        expect(host.openSessions()).toEqual([]);
      });

      it('surfaces injected GATT and connection failures', async () => {
        const created = await endpoint();
        host.failNext('connect', 'CONNECTION_FAILED', { detail: 'radio' });
        await expect(a.openSession(created.id)).rejects.toMatchObject({ code: 'CONNECTION_FAILED', retryable: true });
        expect(host.openSessions()).toEqual([]);
        const session = await a.openSession(created.id);
        host.failNext('read', 'GATT_ERROR');
        await expect(session.read('info')).rejects.toMatchObject({ code: 'GATT_ERROR', retryable: false });
        await expect(session.read('info')).resolves.toEqual(bytes(1, 2, 3));
        await session.close();
      });

      it('reports DEVICE_NOT_FOUND when the device is not near the reader', async () => {
        const created = await endpoint(a, 2);
        host.addPeripheral({
          readerId: 1,
          address: ADDRESS,
          addressType: 'public',
          advertisement: {},
          characteristics: {},
        });
        await expect(a.openSession(created.id)).rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND', retryable: true });
      });

      it('passes reader errors through and validates the connect deadline', async () => {
        const created = await endpoint();
        host.failNext('connect', 'READER_BUSY');
        await expect(a.openSession(created.id)).rejects.toMatchObject({ code: 'READER_BUSY', retryable: true });
        await expect(a.openSession(created.id, { connectTimeoutMs: 60_001 })).rejects.toMatchObject({
          code: 'INVALID_ARGUMENT',
        });
      });

      it('closes with "disconnected" when the peripheral drops and fails pending calls once', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const pending = capture(session.read('slow'));
        await host.advance(1);
        await host.disconnect(ADDRESS);
        await expect(session.closed).resolves.toEqual({ reason: 'disconnected' });
        await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'DISCONNECTED', retryable: true } });
        await expect(session.write('info', bytes(1))).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
        expect(host.openSessions()).toEqual([]);
        // The link is already gone: the host must not try to disconnect it again.
        expect(ops()).not.toContain('disconnect');
      });

      it('closes when the lease expires', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        await host.advance(29_999);
        expect(host.openSessions()).toHaveLength(1);
        await host.advance(1);
        await expect(session.closed).resolves.toEqual({ reason: 'lease-expired' });
        await expect(session.read('info')).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
        expect(disconnects()).toBe(1);
        const long = await a.openSession(created.id, { leaseMs: 60_000 });
        await host.advance(59_999);
        expect(host.openSessions()).toHaveLength(1);
        await long.close();
        expect(disconnects()).toBe(2);
        await expect(a.openSession(created.id, { leaseMs: 60_001 })).rejects.toMatchObject({
          code: 'INVALID_ARGUMENT',
        });
      });

      it('errors the stream on notification overflow instead of dropping', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const stream = await session.subscribe('events');
        host.notify(ADDRESS, 'fff2', bytes(1));
        host.notify(ADDRESS, 'fff2', bytes(2));
        host.notify(ADDRESS, 'fff2', bytes(3));
        await expect(stream.next()).rejects.toMatchObject({ code: 'NOTIFICATION_OVERFLOW' });
        // The stream stays failed, the link subscription is torn down, and later notifications go nowhere.
        await expect(stream.next()).rejects.toMatchObject({ code: 'NOTIFICATION_OVERFLOW' });
        expect(ops()).toContain('unsubscribe');
        host.notify(ADDRESS, 'fff2', bytes(4));
        await expect(stream.next({ timeoutMs: 100 })).rejects.toMatchObject({ code: 'NOTIFICATION_OVERFLOW' });
        expect(host.openSessions()).toHaveLength(1);
        await expect(session.read('info')).resolves.toEqual(bytes(1, 2, 3));
        // The key is free again for a fresh subscription.
        const again = await session.subscribe('events');
        host.notify(ADDRESS, 'fff2', bytes(5));
        expect((await again.next()).value).toEqual(bytes(5));
        await session.close();
      });

      it('delivers notifications in order and times out an empty wait', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const stream = await session.subscribe('events');
        host.notify(ADDRESS, 'fff2', bytes(1));
        host.notify(ADDRESS, 'fff2', bytes(2));
        expect((await stream.next()).value).toEqual(bytes(1));
        expect((await stream.next()).value).toEqual(bytes(2));
        const waiting = capture(stream.next({ timeoutMs: 500 }));
        await host.advance(500);
        await expect(waiting).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
        const controller = new AbortController();
        const cancelled = capture(stream.next({ signal: controller.signal }));
        controller.abort();
        await expect(cancelled).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
        await session.close();
      });

      it('ends the iterator on unsubscribe and delivers only to the owning session', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const stream = await session.subscribe('events');
        await expect(session.subscribe('events')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        const seen: number[] = [];
        const reading = (async () => {
          for await (const notification of stream) seen.push(notification.value[0]);
        })();
        host.notify(ADDRESS, 'fff2', bytes(5));
        await host.advance(1);
        await stream.unsubscribe();
        await reading;
        expect(seen).toEqual([5]);
        host.notify(ADDRESS, 'fff2', bytes(6));
        await session.unsubscribe('events');
        await session.close();
      });

      it('allows only one session per endpoint', async () => {
        const created = await endpoint();
        const [first, second] = await Promise.all([
          capture(a.openSession(created.id)),
          capture(a.openSession(created.id)),
        ]);
        const outcomes = [first, second];
        expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
        expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({
          error: { code: 'ENDPOINT_BUSY', retryable: true },
        });
        const open = outcomes.find((outcome) => outcome.ok) as { value: PluginBleSession };
        await open.value.close();
        const reopened = await a.openSession(created.id);
        await reopened.close();
      });

      it('runs operations one at a time in call order', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        // The slow read answers after 20 s; the writes queued behind it must not reach the transport before.
        const read = capture(session.read('slow', { timeoutMs: 30_000 }));
        const writes = [bytes(1), bytes(2), bytes(3)].map((value) => session.write('info', value));
        await host.advance(1);
        expect(ops()).toEqual(['connect', 'read']);
        await host.advance(19_998);
        expect(ops()).toEqual(['connect', 'read']);
        await host.advance(1);
        await expect(read).resolves.toEqual({ ok: true, value: bytes(9) });
        await Promise.all(writes);
        expect(ops()).toEqual(['connect', 'read', 'write', 'write', 'write']);
        const written = host.transcript.filter((entry) => entry.op === 'write').map((entry) => entry.bytes?.[0]);
        expect(written).toEqual([1, 2, 3]);
        await session.close();
      });

      it('settles every pending promise exactly once on close', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const settled: string[] = [];
        const track = (label: string, promise: Promise<unknown>) =>
          promise.then(
            () => settled.push(`${label}:ok`),
            (error: { code: string }) => settled.push(`${label}:${error.code}`),
          );
        const first = track('first', session.read('slow'));
        const queued = track('queued', session.read('info'));
        await host.advance(1);
        await session.close();
        await Promise.all([first, queued]);
        await host.advance(60_000);
        expect(settled.sort()).toEqual(['first:SESSION_CLOSED', 'queued:SESSION_CLOSED']);
      });

      it('withSession closes the session on success and on throw', async () => {
        const created = await endpoint();
        await expect(a.withSession(created.id, async (session) => session.read('info'))).resolves.toEqual(
          bytes(1, 2, 3),
        );
        expect(host.openSessions()).toEqual([]);
        let captured: PluginBleSession | undefined;
        await expect(
          a.withSession(created.id, async (session) => {
            captured = session;
            throw new Error('plugin bug');
          }),
        ).rejects.toThrow('plugin bug');
        expect(host.openSessions()).toEqual([]);
        await expect(captured?.closed).resolves.toEqual({ reason: 'closed' });
        expect(disconnects()).toBe(2);
      });

      it('withSession closes with "cancelled" when its signal aborts', async () => {
        const created = await endpoint();
        const controller = new AbortController();
        let captured: PluginBleSession | undefined;
        const outcome = await a.withSession(
          created.id,
          async (session) => {
            captured = session;
            const pending = capture(session.read('slow'));
            await host.advance(1);
            controller.abort();
            return pending;
          },
          { signal: controller.signal },
        );
        expect(outcome).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
        await expect(captured?.closed).resolves.toEqual({ reason: 'cancelled' });
        expect(ops()).toEqual(['connect', 'read', 'disconnect']);
        expect(host.openSessions()).toEqual([]);
      });
    });

    describe('cleanup the host guarantees', () => {
      const closedWith = async (action: () => Promise<unknown>, reason: PluginBleCloseReason) => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        const pending = capture(session.read('slow'));
        await host.advance(1);
        await action();
        await expect(session.closed).resolves.toEqual({ reason });
        await expect(pending).resolves.toMatchObject({ ok: false });
        expect(host.openSessions()).toEqual([]);
        // Every host-initiated close releases the link.
        expect(ops()).toEqual(['connect', 'read', 'disconnect']);
        return created;
      };

      it('closes with "shutdown" when the plugin module is destroyed', async () => {
        await closedWith(() => host.shutdownPlugin('plugin-a'), 'shutdown');
        await expect(a.listEndpoints()).resolves.toHaveLength(1);
      });

      it('closes with "reader-access-revoked" on opt-out and keeps the endpoint', async () => {
        const created = await closedWith(() => host.setReaderAccess(1, false), 'reader-access-revoked');
        await expect(a.getEndpoint(created.id)).resolves.toBeDefined();
        await expect(a.openSession(created.id)).rejects.toMatchObject({ code: 'READER_ACCESS_DENIED' });
        await expect(a.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'READER_ACCESS_DENIED' });
        await expect(endpoint(a, 1)).rejects.toMatchObject({ code: 'READER_ACCESS_DENIED' });
        await host.setReaderAccess(1, true);
        const session = await a.openSession(created.id);
        await session.close();
      });

      it('closes with "reader-access-revoked" and removes endpoints when the reader is deleted', async () => {
        const created = await closedWith(() => host.removeReader(1), 'reader-access-revoked');
        await expect(a.getEndpoint(created.id)).rejects.toMatchObject({ code: 'ENDPOINT_NOT_FOUND' });
      });

      it('closes with "endpoint-deleted" when the endpoint is deleted', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        await a.deleteEndpoint(created.id);
        await expect(session.closed).resolves.toEqual({ reason: 'endpoint-deleted' });
        expect(ops()).toEqual(['connect', 'disconnect']);
      });

      it('closes with "endpoint-deleted" when the endpoint moves, but not for a label change', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        await a.updateEndpoint(created.id, { label: 'Side door' });
        expect(host.openSessions()).toHaveLength(1);
        await a.updateEndpoint(created.id, { readerId: 2 });
        await expect(session.closed).resolves.toEqual({ reason: 'endpoint-deleted' });
        expect(ops()).toEqual(['connect', 'disconnect']);
      });

      it('removes the plugin’s endpoints on uninstall', async () => {
        const created = await endpoint();
        const session = await a.openSession(created.id);
        await host.uninstallPlugin('plugin-a');
        await expect(session.closed).resolves.toEqual({ reason: 'endpoint-deleted' });
        await expect(a.listEndpoints()).resolves.toEqual([]);
        expect(ops()).toEqual(['connect', 'disconnect']);
        expect(host.openSessions()).toEqual([]);
      });
    });

    describe('lazy boundary', () => {
      it('rejects async calls with a retryable NOT_READY and never throws synchronously', async () => {
        await subject.dispose();
        subject = await create({ ready: false });
        host = subject.host;
        const early = host.contextFor('early-plugin');
        const profile = early.registerProfile(PROFILE);
        expect(profile.id).toBe('demo-device');
        const calls: Array<() => Promise<unknown>> = [
          () => early.listReaders(),
          () => early.scan(1, PROFILE.id),
          () => early.createEndpoint({ readerId: 1, address: ADDRESS, addressType: 'public', profileId: PROFILE.id }),
          () => early.getEndpoint('x'),
          () => early.listEndpoints(),
          () => early.updateEndpoint('x', {}),
          () => early.deleteEndpoint('x'),
          () => early.openSession('x'),
          () => early.withSession('x', async () => 1),
        ];
        for (const call of calls) {
          let promise: Promise<unknown> | undefined;
          expect(() => (promise = call())).not.toThrow();
          await expect(promise).rejects.toMatchObject({ code: 'NOT_READY', retryable: true });
        }
        host.setReady(true);
        await expect(early.listEndpoints()).resolves.toEqual([]);
      });
    });
  });
}

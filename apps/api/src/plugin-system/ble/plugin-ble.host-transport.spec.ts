import 'reflect-metadata';
import { Attractap, entities } from '@attraccess/database-entities';
import { PluginBleError, type PluginBleContext } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AttractapService } from '../../attractap/attractap.service';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../../attractap/events';
import { createHostBleHarness, type HostBleHarness } from './__test__/ble-host-harness.test-fixture';
import { BleTestDriver, ManualClock } from './__test__/ble-test-driver.test-fixture';
import { BLE_TRANSPORT_DRIVER } from './ble-transport-driver';
import { createPluginBleContext } from './plugin-ble-context';
import { clearPluginBleProfiles } from './plugin-ble-profile-registry';
import { PluginBleService } from './plugin-ble.service';

const PROFILE = {
  id: 'demo',
  advertisement: { serviceUuids: ['fff0'] },
  services: [
    {
      uuid: 'fff0',
      characteristics: [
        { key: 'info', uuid: 'fff1', operations: ['read', 'write'] as const, maxReadBytes: 8, maxWriteBytes: 8 },
        { key: 'events', uuid: 'fff2', operations: ['notify'] as const, maxNotificationBytes: 8 },
      ],
    },
  ],
};
const ADDRESS = 'AA:BB:CC:DD:EE:01';
const silent = () => ({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() });

const capture = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: { code?: string; retryable?: boolean }) => ({ ok: false as const, error }),
  );

/** Lets real I/O (the SQLite queries before a connect) run until `predicate` holds. */
async function waitFor(predicate: () => boolean): Promise<void> {
  // Real time, not a round count: under a loaded pre-commit run the SQLite I/O can take a while.
  const giveUpAt = Date.now() + 15_000;
  while (!predicate() && Date.now() < giveUpAt) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(predicate()).toBe(true);
}

describe('PluginBleService with a misbehaving transport', () => {
  let harness: HostBleHarness;
  let driver: BleTestDriver;
  let ble: PluginBleContext;

  const ops = () => harness.transcript.map((entry) => entry.op);
  const endpoint = () =>
    ble.createEndpoint({ readerId: 1, address: ADDRESS, addressType: 'public', profileId: 'demo' });

  beforeEach(async () => {
    harness = await createHostBleHarness();
    driver = harness.driver;
    ble = createPluginBleContext({ id: 'plugin-a', logger: silent() }, () => harness.service);
    ble.registerProfile(PROFILE as never);
    await harness.addReader({ readerId: 1, name: 'Reader', allowPluginBle: true });
    harness.addPeripheral({
      readerId: 1,
      address: ADDRESS,
      addressType: 'public',
      advertisement: { serviceUuids: ['fff0'] },
      characteristics: { fff1: { value: Uint8Array.of(1, 2, 3) }, fff2: {} },
    });
  });

  afterEach(() => harness.dispose());

  describe('synchronous throws from the driver', () => {
    it('turns a synchronous write throw into a rejection and keeps the queue moving', async () => {
      const session = await ble.openSession((await endpoint()).id);
      driver.throwSyncNext('write');
      // Queued behind the failing write: these must still run, without any clock movement.
      const failing = session.write('info', Uint8Array.of(1));
      const next = session.write('info', Uint8Array.of(2));
      const read = session.read('info');
      await expect(failing).rejects.toMatchObject({ code: 'GATT_ERROR' });
      await expect(next).resolves.toBeUndefined();
      await expect(read).resolves.toEqual(Uint8Array.of(2));
      expect(harness.openSessions()).toHaveLength(1);
      await session.close();
    });

    it('wraps a synchronous throw of a foreign error in INTERNAL without its message', async () => {
      const session = await ble.openSession((await endpoint()).id);
      driver.throwSyncNext('write', new TypeError('secret detail'));
      const failure = await capture(session.write('info', Uint8Array.of(1)));
      expect(failure).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
      expect(String((failure as { error: { message?: string } }).error.message)).not.toContain('secret');
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('survives synchronous throws from read, subscribe and unsubscribe', async () => {
      const session = await ble.openSession((await endpoint()).id);
      driver.throwSyncNext('read');
      await expect(session.read('info')).rejects.toMatchObject({ code: 'GATT_ERROR' });
      driver.throwSyncNext('subscribe');
      await expect(session.subscribe('events')).rejects.toMatchObject({ code: 'GATT_ERROR' });
      const stream = await session.subscribe('events');
      driver.throwSyncNext('unsubscribe');
      await expect(session.unsubscribe('events')).rejects.toMatchObject({ code: 'GATT_ERROR' });
      await expect(stream.next({ timeoutMs: 100 })).rejects.toMatchObject({ code: 'CANCELLED' });
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('fails an open whose connect throws synchronously and frees the endpoint', async () => {
      const created = await endpoint();
      driver.throwSyncNext('connect', new PluginBleError('CONNECTION_FAILED', 'radio'));
      await expect(ble.openSession(created.id)).rejects.toMatchObject({ code: 'CONNECTION_FAILED', retryable: true });
      expect(harness.openSessions()).toEqual([]);
      const session = await ble.openSession(created.id);
      await session.close();
    });

    it('closes a session whose disconnect throws synchronously and frees the endpoint', async () => {
      const created = await endpoint();
      const session = await ble.openSession(created.id);
      driver.throwSyncNext('disconnect');
      await expect(session.close()).resolves.toBeUndefined();
      await expect(session.closed).resolves.toEqual({ reason: 'closed' });
      expect(harness.openSessions()).toEqual([]);
      const again = await ble.openSession(created.id);
      await again.close();
    });
  });

  describe('connect deadline', () => {
    const openPending = async (options?: { connectTimeoutMs?: number }) => {
      const created = await endpoint();
      let settled = false;
      const opening = capture(ble.openSession(created.id, options)).finally(() => (settled = true));
      await waitFor(() => ops().includes('connect'));
      return { created, opening, isSettled: () => settled };
    };

    it.each([
      ['the default 15 s', undefined, 15_000],
      ['a custom connectTimeoutMs', 2_000, 2_000],
    ])('times out after %s with a retryable TIMEOUT', async (_label, connectTimeoutMs, deadline) => {
      driver.connectDelayMs = 30_000;
      const { opening, isSettled } = await openPending(connectTimeoutMs ? { connectTimeoutMs } : undefined);
      await harness.advance(deadline - 1);
      expect(isSettled()).toBe(false);
      expect(harness.openSessions()).toHaveLength(1);
      await harness.advance(1);
      await expect(opening).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT', retryable: true } });
      expect(harness.openSessions()).toEqual([]);
      expect(driver.liveLinks).toBe(0);
    });

    it('disconnects a link that arrives after the deadline', async () => {
      driver.connectDelayMs = 20_000;
      driver.connectHonoursAbort = false;
      const { created, opening } = await openPending();
      await harness.advance(15_000);
      await expect(opening).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      // The endpoint stays busy while the transport's connect still runs, so a reopen cannot overlap it.
      expect(harness.openSessions()).toHaveLength(1);
      await expect(ble.openSession(created.id)).rejects.toMatchObject({ code: 'ENDPOINT_BUSY', retryable: true });
      expect(ops()).toEqual(['connect']);

      await harness.advance(5_000);
      expect(ops()).toEqual(['connect', 'disconnect']);
      expect(driver.liveLinks).toBe(0);
      expect(harness.openSessions()).toEqual([]);

      driver.connectDelayMs = 0;
      const session = await ble.openSession(created.id);
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('disconnects a late link after the open signal cancelled the connect', async () => {
      driver.connectDelayMs = 20_000;
      driver.connectHonoursAbort = false;
      const created = await endpoint();
      const controller = new AbortController();
      const opening = capture(ble.openSession(created.id, { signal: controller.signal }));
      await waitFor(() => ops().includes('connect'));
      controller.abort();
      await expect(opening).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      expect(harness.openSessions()).toHaveLength(1);
      await harness.advance(20_000);
      expect(ops()).toEqual(['connect', 'disconnect']);
      expect(harness.openSessions()).toEqual([]);
      expect(driver.liveLinks).toBe(0);
    });
  });
});

describe('PluginBleService reader events through the real event bus', () => {
  let source: DataSource;
  let module: TestingModule;
  let events: EventEmitter2;
  let attractap: AttractapService;
  let driver: BleTestDriver;
  let ble: PluginBleContext;

  beforeEach(async () => {
    clearPluginBleProfiles();
    source = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    driver = new BleTestDriver(new ManualClock());
    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        PluginBleService,
        { provide: DataSource, useValue: source },
        { provide: BLE_TRANSPORT_DRIVER, useValue: driver },
      ],
    }).compile();
    await module.init();
    events = module.get(EventEmitter2);
    const service = module.get(PluginBleService);
    // The real reader service emits the events; only the collaborators it does not touch here are stubs.
    attractap = new AttractapService(
      {} as never,
      source.getRepository(Attractap),
      {} as never,
      events,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    ble = createPluginBleContext({ id: 'plugin-a', logger: silent() }, () => service);
    ble.registerProfile(PROFILE as never);
    for (const id of [1, 2]) {
      await source.getRepository(Attractap).insert({
        id,
        name: `Reader ${id}`,
        apiTokenHash: 'hash',
        allowPluginBle: true,
      } as Attractap);
    }
    driver.addPeripheral({
      readerIds: [1, 2],
      address: ADDRESS,
      addressType: 'public',
      advertisement: { serviceUuids: ['fff0'] },
      characteristics: { fff1: { value: Uint8Array.of(1) } },
    });
  });

  afterEach(async () => {
    await module.close();
    await source.destroy();
  });

  const session = async (readerId: number) => {
    const created = await ble.createEndpoint({ readerId, address: ADDRESS, addressType: 'public', profileId: 'demo' });
    return ble.openSession(created.id);
  };
  const disconnectsOf = (readerId: number) =>
    driver.transcript.filter((entry) => entry.op === 'disconnect' && entry.readerId === readerId).length;

  it('subscribes the service once to each reader event', () => {
    expect(events.listenerCount(ReaderUpdatedEvent.EVENT_NAME)).toBe(1);
    expect(events.listenerCount(ReaderDeletedEvent.EVENT_NAME)).toBe(1);
  });

  it('closes sessions with "reader-access-revoked" when an admin turns the opt-in off', async () => {
    const one = await session(1);
    const two = await session(2);

    await attractap.updateReader(1, { name: 'Renamed' });
    await attractap.updateReader(1, { ledBrightness: 10 });
    await expect(one.read('info')).resolves.toEqual(Uint8Array.of(1));

    await attractap.updateReader(1, { allowPluginBle: false });
    await expect(one.closed).resolves.toEqual({ reason: 'reader-access-revoked' });
    expect(disconnectsOf(1)).toBe(1);
    await expect(ble.listEndpoints()).resolves.toHaveLength(2);
    await expect(two.read('info')).resolves.toEqual(Uint8Array.of(1));
    await two.close();
  });

  it('ignores a forged opt-out event while the database still allows the reader', async () => {
    const one = await session(1);
    await events.emitAsync(
      ReaderUpdatedEvent.EVENT_NAME,
      new ReaderUpdatedEvent({ id: 1, allowPluginBle: false } as Attractap),
    );
    await expect(one.read('info')).resolves.toEqual(Uint8Array.of(1));
    expect(disconnectsOf(1)).toBe(0);
    await one.close();
  });

  it('closes sessions with "reader-access-revoked" when the reader is deleted', async () => {
    const one = await session(1);
    const two = await session(2);
    await expect(attractap.deleteReader(2)).resolves.toBe(true);
    await expect(two.closed).resolves.toEqual({ reason: 'reader-access-revoked' });
    expect(disconnectsOf(2)).toBe(1);
    await expect(one.read('info')).resolves.toEqual(Uint8Array.of(1));
    await one.close();
  });
});

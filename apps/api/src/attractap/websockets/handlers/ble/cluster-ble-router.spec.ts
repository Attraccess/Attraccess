import type { BleDriverLink, BleWatchFilter } from '../../../../plugin-system/ble/ble-transport-driver';
import { ClusterService } from '../../../../cluster/cluster.service';
import { WebsocketService } from '../../websocket.service';
import { AttractapEventType } from '../../websocket.types';
import { ReaderBleDriver } from './reader-ble.driver';
import {
  ADDRESS,
  BleNode,
  BULK,
  connectRequest,
  createRadio,
  EVENTS,
  FakeClusterNetwork,
  INFO,
  scanRequest,
  SERVICE,
  SLOW,
  waitFor,
  watchRecorder,
} from './__test__/cluster-ble.test-fixture';

const capture = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: { code?: string; detail?: string }) => ({ ok: false as const, error }),
  );

const signal = () => new AbortController().signal;
const ref = (characteristicUuid: string) => ({ serviceUuid: SERVICE, characteristicUuid, signal: signal() });
const byService = (id: number): BleWatchFilter => ({ id, serviceUuids: [SERVICE], manufacturerIds: [] });
const byMaker = (id: number, maker: number): BleWatchFilter => ({ id, serviceUuids: [], manufacturerIds: [maker] });
const KEEPALIVE = 30_000;

describe('ReaderBleDriver across API instances (ATT-1163)', () => {
  let network: FakeClusterNetwork;
  let radio: ReturnType<typeof createRadio>;
  let a: BleNode;
  let b: BleNode;

  beforeEach(() => {
    network = new FakeClusterNetwork();
    radio = createRadio();
    a = new BleNode('a', network.cluster('a'), radio);
    b = new BleNode('b', network.cluster('b'), radio);
  });

  afterEach(() => {
    a.dispose();
    b.dispose();
  });

  const lostOf = (link: BleDriverLink) => {
    const lost: Array<string | undefined> = [];
    link.onDisconnected((detail) => lost.push(detail));
    return lost;
  };

  it('stays on the local path without Valkey', () => {
    const driver = new ReaderBleDriver(new WebsocketService(), undefined, ClusterService.local());
    expect(driver.router).toBeNull();
    expect(driver.readerStatus(1)).toEqual({ status: 'offline' });
  });

  describe('status, scan and connect', () => {
    it('asks the holding instance for the reader status, and is offline while nobody holds the reader', async () => {
      await expect(b.driver.readerStatus(1)).resolves.toEqual({ status: 'offline' });
      a.connectReader();
      await expect(b.driver.readerStatus(1)).resolves.toEqual({ status: 'available' });
      await expect(a.driver.readerStatus(1)).resolves.toEqual({ status: 'available' });
    });

    it('scans through the holding instance', async () => {
      a.connectReader();
      const found = await b.driver.scan(scanRequest());
      expect(found).toEqual([
        expect.objectContaining({
          address: ADDRESS,
          name: 'Demo',
          manufacturerData: [{ companyId: 7, data: Uint8Array.of(9) }],
        }),
      ]);
      expect(a.sent(AttractapEventType.BLE_SCAN)).toHaveLength(1);
    });

    it('answers READER_OFFLINE when no instance holds the reader', async () => {
      await expect(b.driver.scan(scanRequest())).rejects.toMatchObject({ code: 'READER_OFFLINE' });
      await expect(b.driver.connect(connectRequest())).rejects.toMatchObject({ code: 'READER_OFFLINE' });
    });

    it('answers READER_BUSY as the holding instance does', async () => {
      a.connectReader();
      const local = await a.driver.connect(connectRequest(signal(), 'local'));
      await expect(b.driver.connect(connectRequest())).rejects.toMatchObject({
        code: 'READER_BUSY',
        detail: 'session',
      });
      await expect(b.driver.scan(scanRequest())).rejects.toMatchObject({ code: 'READER_BUSY', detail: 'session' });
      await local.disconnect();
    });

    it('runs a session on the holding instance: read, write, write without response, notify, close', async () => {
      a.connectReader();
      const link = await b.driver.connect(connectRequest());
      expect(link.mtu).toBeGreaterThanOrEqual(23);
      expect(b.driver.router?.counts).toEqual({ remote: 1, served: 0 });
      expect(a.driver.router?.counts).toEqual({ remote: 0, served: 1 });

      await expect(link.read(ref(INFO))).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await link.write({ ...ref(INFO), value: Uint8Array.of(4, 5), withoutResponse: false });
      await expect(link.read(ref(INFO))).resolves.toEqual(Uint8Array.of(4, 5));
      await link.write({ ...ref(BULK), value: Uint8Array.of(6), withoutResponse: true });
      await waitFor(() => radio.transcript.some((entry) => entry.op === 'write' && entry.characteristicUuid === BULK));

      const notifications: Uint8Array[] = [];
      await link.subscribe({ ...ref(EVENTS), indicate: false, onNotification: (value) => notifications.push(value) });
      radio.notify(ADDRESS, 'fff2', Uint8Array.of(7));
      await waitFor(() => notifications.length === 1);
      expect(notifications).toEqual([Uint8Array.of(7)]);
      await link.unsubscribe({ serviceUuid: SERVICE, characteristicUuid: EVENTS });
      radio.notify(ADDRESS, 'fff2', Uint8Array.of(8));

      await link.disconnect();
      expect(a.sent(AttractapEventType.BLE_SESSION_CLOSE)).toHaveLength(1);
      expect(notifications).toHaveLength(1);
      expect(b.driver.router?.counts).toEqual({ remote: 0, served: 0 });
      expect(a.driver.router?.counts).toEqual({ remote: 0, served: 0 });
    });

    it('keeps the holder error codes of link operations', async () => {
      a.connectReader();
      const link = await b.driver.connect(connectRequest());
      radio.failNext('read', 'GATT_ERROR', 'att:0x0a');
      await expect(link.read(ref(INFO))).rejects.toMatchObject({ code: 'GATT_ERROR', detail: 'att:0x0a' });
      await expect(link.read(ref(INFO))).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await link.disconnect();
    });

    it('cancels a connect on the origin at once and on the holder', async () => {
      a.connectReader();
      radio.connectDelayMs = 10_000;
      const controller = new AbortController();
      const pending = capture(b.driver.connect(connectRequest(controller.signal)));
      await waitFor(() => a.sent(AttractapEventType.BLE_SESSION_OPEN).length === 1);
      controller.abort();
      await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      await waitFor(() => a.sent(AttractapEventType.BLE_CANCEL).length === 1);
      await waitFor(() => !a.firmware().hasSession);

      radio.connectDelayMs = 0;
      const link = await b.driver.connect(connectRequest(signal(), 'session-2'));
      await link.disconnect();
    });

    it('cancels a link operation on the origin at once and on the holder', async () => {
      a.connectReader();
      const link = await b.driver.connect(connectRequest());
      const controller = new AbortController();
      const pending = capture(link.read({ serviceUuid: SERVICE, characteristicUuid: SLOW, signal: controller.signal }));
      await waitFor(() => a.sent(AttractapEventType.BLE_READ).length === 1);
      controller.abort();
      await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      await waitFor(() => a.sent(AttractapEventType.BLE_CANCEL).length === 1);
      await link.disconnect();
    });

    it('fails pending calls with reader-link-lost when the holding instance is gone', async () => {
      a.connectReader();
      const link = await b.driver.connect(connectRequest());
      const lost = lostOf(link);
      const pending = capture(link.read(ref(SLOW)));
      await waitFor(() => a.sent(AttractapEventType.BLE_READ).length === 1);
      network.kill('a');
      await expect(pending).resolves.toMatchObject({
        ok: false,
        error: { code: 'DISCONNECTED', detail: 'reader-link-lost' },
      });
      expect(lost).toEqual(['reader-link-lost']);
      await expect(link.read(ref(INFO))).rejects.toMatchObject({ code: 'DISCONNECTED' });
      expect(b.driver.router?.counts.remote).toBe(0);
    });

    it('loses an idle link once the periodic check finds the holder gone', async () => {
      a.connectReader();
      const link = await b.driver.connect(connectRequest());
      const lost = lostOf(link);
      network.kill('a');
      await b.driver.router?.check();
      expect(lost).toEqual(['reader-link-lost']);
    });

    it('forwards the reader losing its connection on the holding instance', async () => {
      a.connectReader();
      const link = await b.driver.connect(connectRequest());
      const lost = lostOf(link);
      a.dropReader();
      await waitFor(() => lost.length === 1);
      expect(lost).toEqual(['reader-link-lost']);
      expect(a.driver.router?.counts.served).toBe(0);
    });

    it('closes the links of an origin that is gone', async () => {
      a.connectReader();
      await b.driver.connect(connectRequest());
      network.kill('b');
      await a.driver.router?.check();
      expect(a.sent(AttractapEventType.BLE_SESSION_CLOSE)).toHaveLength(1);
      expect(a.driver.router?.counts.served).toBe(0);
    });

    it('follows the reader to the instance it signs in on; the old holder lets go of it', async () => {
      a.connectReader();
      const link = await b.driver.connect(connectRequest());
      const lost = lostOf(link);
      const stale = a.firmware();
      // The reader reconnects to b while its old connection to a is still half-open.
      b.connectReader();
      expect(lost).toEqual(['reader-link-lost']);
      await expect(a.driver.readerStatus(1)).resolves.toEqual({ status: 'available' });
      const local = await b.driver.connect(connectRequest(signal(), 'session-2'));
      await expect(local.read(ref(INFO))).resolves.toEqual(Uint8Array.of(1, 2, 3));
      expect(b.sent(AttractapEventType.BLE_SESSION_OPEN)).toHaveLength(1);
      expect(stale.received.filter((message) => message.type === AttractapEventType.BLE_SESSION_OPEN)).toHaveLength(1);
      await local.disconnect();
    });
  });

  describe('advertisement watch', () => {
    it('merges the sets of all instances on the holder and routes events back with each instance’s ids', async () => {
      a.connectReader();
      const onA = watchRecorder();
      const onB = watchRecorder();
      b.driver.setWatch({
        readerId: 1,
        filters: [byService(7), byMaker(8, 0x4c)],
        keepaliveMs: KEEPALIVE,
        listener: onB.listener,
      });
      await waitFor(() => onB.last()?.status === 'watching');
      a.driver.setWatch({
        readerId: 1,
        filters: [byService(3), byMaker(4, 0x59)],
        keepaliveMs: KEEPALIVE,
        listener: onA.listener,
      });
      await waitFor(() => onA.last()?.status === 'watching');
      // Equal filters of both instances are one reader filter.
      expect(a.firmware().watchFilters).toHaveLength(3);

      a.firmware().advertise({
        address: ADDRESS,
        addressType: 'public',
        serviceUuids: [SERVICE],
        manufacturerData: [],
      });
      await waitFor(() => onA.events.length === 1 && onB.events.length === 1);
      expect(onA.events[0]).toMatchObject({ address: ADDRESS, filterIds: [3] });
      expect(onB.events[0]).toMatchObject({ address: ADDRESS, filterIds: [7] });
      expect(onB.events[0].receivedAt).toBeInstanceOf(Date);

      a.firmware().advertise({
        address: 'AA:BB:CC:DD:EE:09',
        addressType: 'public',
        serviceUuids: [],
        manufacturerData: [{ companyId: 0x4c, data: Uint8Array.of(1) }],
      });
      await waitFor(() => onB.events.length === 2);
      expect(onB.events[1]).toMatchObject({
        filterIds: [8],
        manufacturerData: [{ companyId: 0x4c, data: Uint8Array.of(1) }],
      });
      expect(onA.events).toHaveLength(1);

      // b withdraws: its own filter leaves the reader, the shared one stays for a.
      b.driver.setWatch({ readerId: 1, filters: [], keepaliveMs: KEEPALIVE, listener: onB.listener });
      await waitFor(() => a.firmware().watchFilters.length === 2);
      a.firmware().advertise(
        { address: ADDRESS, addressType: 'public', serviceUuids: [SERVICE], manufacturerData: [] },
        true,
      );
      await waitFor(() => onA.events.length === 2);
      expect(onB.events).toHaveLength(2);
    });

    it('reports a filter the reader cannot take to its owner only, with the owner’s id', async () => {
      a.connectReader();
      const onA = watchRecorder();
      const onB = watchRecorder();
      a.driver.setWatch({ readerId: 1, filters: [byService(1)], keepaliveMs: KEEPALIVE, listener: onA.listener });
      const tooLarge = Array.from({ length: 9 }, (_, index) => `0000ff0${index}-0000-1000-8000-00805f9b34fb`);
      b.driver.setWatch({
        readerId: 1,
        filters: [{ id: 42, serviceUuids: tooLarge, manufacturerIds: [] }],
        keepaliveMs: KEEPALIVE,
        listener: onB.listener,
      });
      await waitFor(() => onB.last()?.status === 'watching');
      expect(onB.last()).toEqual({ status: 'watching', excluded: [{ id: 42, detail: 'filter-too-large' }] });
      await waitFor(() => onA.states.length >= 2);
      expect(onA.last()).toEqual({ status: 'watching' });
    });

    it('is offline while nobody holds the reader and follows the reader wherever it signs in', async () => {
      const onB = watchRecorder();
      b.driver.setWatch({ readerId: 1, filters: [byService(5)], keepaliveMs: KEEPALIVE, listener: onB.listener });
      await waitFor(() => onB.last()?.status === 'offline');

      a.connectReader();
      await waitFor(() => onB.last()?.status === 'watching');
      expect(a.firmware().watchFilters.map((filter) => filter.serviceUuids)).toEqual([[SERVICE]]);

      b.connectReader();
      await waitFor(() => b.firmware().watchFilters.length === 1);
      // a's late `offline` for its stale connection is not taken: b holds the reader now.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(onB.last()).toEqual({ status: 'watching' });
      b.firmware().advertise({
        address: ADDRESS,
        addressType: 'public',
        serviceUuids: [SERVICE],
        manufacturerData: [],
      });
      expect(onB.events).toEqual([expect.objectContaining({ filterIds: [5] })]);
    });

    it('drops the part of an origin that is gone', async () => {
      a.connectReader();
      const onB = watchRecorder();
      b.driver.setWatch({ readerId: 1, filters: [byService(5)], keepaliveMs: KEEPALIVE, listener: onB.listener });
      await waitFor(() => a.firmware().watchFilters.length === 1);
      network.kill('b');
      await a.driver.router?.check();
      expect(a.firmware().watchFilters).toEqual([]);
    });

    it('reports offline to the origin when the holder is gone', async () => {
      a.connectReader();
      const onB = watchRecorder();
      b.driver.setWatch({ readerId: 1, filters: [byService(5)], keepaliveMs: KEEPALIVE, listener: onB.listener });
      await waitFor(() => onB.last()?.status === 'watching');
      network.kill('a');
      await b.driver.router?.check();
      expect(onB.last()).toEqual({ status: 'offline' });
    });
  });
});

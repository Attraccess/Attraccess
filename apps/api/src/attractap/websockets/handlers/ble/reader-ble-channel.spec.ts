import { PLUGIN_BLE_LIMITS } from '@attraccess/plugins-backend-sdk';
import { AttractapEventType } from '../../websocket.types';
import { parseBleCapability } from './ble-wire';
import { BLE_CLOSE_RESERVE, BLE_MAX_PENDING_REQUESTS } from './reader-ble-channel';
import { FAKE_READER_BLE_CAPABILITY } from './__test__/fake-ble-reader.test-fixture';
import { ADDRESS, capture, OTHER, PROFILE, useReaderBleSpec } from './__test__/reader-ble-spec.test-fixture';

describe('ReaderBleChannel (one reader connection)', () => {
  const spec = useReaderBleSpec();
  const { socket, sent, fromReader, endpoint, flush, until } = spec;
  const firmware = () => spec.firmware();
  const ble = () => spec.ble;

  /** Requests the reader never answers, abandoned at once: they hold their slot until their deadline. */
  const fillWithAbandoned = (sessionId: string, upTo: number) => {
    const channel = spec.channel();
    const controller = new AbortController();
    const results: Array<Promise<unknown>> = [];
    while (channel.pendingCount < upTo) {
      const call = channel.request(AttractapEventType.BLE_READ, sessionId, { timeoutMs: 1_000 }, 'read', {
        signal: controller.signal,
        timeoutMs: 1_000,
      });
      results.push(call.result.catch(() => undefined));
    }
    controller.abort();
    return Promise.all(results);
  };

  describe('the request cap', () => {
    it.each([
      [16, 16],
      [undefined, BLE_MAX_PENDING_REQUESTS],
      [0, 1],
      [-5, 1],
      [1_000_000, BLE_MAX_PENDING_REQUESTS],
      ['16', BLE_MAX_PENDING_REQUESTS],
      [8.5, BLE_MAX_PENDING_REQUESTS],
    ])('reads maxPendingRequests %j from capabilities.ble as %d', (announced, cap) => {
      expect(parseBleCapability({ ...FAKE_READER_BLE_CAPABILITY, maxPendingRequests: announced })).toMatchObject({
        capability: { maxPendingRequests: cap },
      });
    });

    it.each([
      ['the cap the reader announced', FAKE_READER_BLE_CAPABILITY.maxPendingRequests],
      ['the API cap when the reader announced none', BLE_MAX_PENDING_REQUESTS],
    ])('enforces %s', async (_name, cap) => {
      if (cap === BLE_MAX_PENDING_REQUESTS) {
        socket().state.ble = parseBleCapability({ ...FAKE_READER_BLE_CAPABILITY, maxPendingRequests: undefined });
      }
      const session = await ble().openSession((await endpoint()).id);
      firmware().silent = true;
      const released = fillWithAbandoned(session.id, cap);
      expect(() => spec.channel().request(AttractapEventType.BLE_READ, session.id, {}, 'read')).toThrow(
        expect.objectContaining({ code: 'READER_BUSY', detail: 'queue-full' }),
      );
      await expect(session.read('info')).rejects.toMatchObject({ code: 'READER_BUSY', detail: 'queue-full' });
      await spec.harness.advance(1_000 + 5_000);
      await released;
      firmware().silent = false;
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('still sends the session close when abandoned requests fill the cap', async () => {
      const session = await ble().openSession((await endpoint()).id);
      firmware().silent = true;
      const released = fillWithAbandoned(session.id, FAKE_READER_BLE_CAPABILITY.maxPendingRequests);
      const closing = session.close();
      await flush();
      // Without the close, the reader would keep the peripheral until its lease ran out.
      expect(sent(AttractapEventType.BLE_SESSION_CLOSE)).toEqual([
        {
          type: AttractapEventType.BLE_SESSION_CLOSE,
          payload: { v: 1, sessionId: session.id, requestId: expect.any(Number) },
        },
      ]);
      expect(spec.harness.driver.liveLinks).toBe(0);
      await spec.harness.advance(6_000);
      await closing;
      await released;
      expect(spec.channel().busy).toBe(false);
    });

    it('still sends the close behind a cancelled connect when the cap is full', async () => {
      const created = await endpoint();
      const controller = new AbortController();
      firmware().silent = true;
      const opening = capture(ble().openSession(created.id, { signal: controller.signal }));
      await until(() => sent(AttractapEventType.BLE_SESSION_OPEN).length === 1);
      const [open] = sent(AttractapEventType.BLE_SESSION_OPEN);
      const released = fillWithAbandoned('other-session', FAKE_READER_BLE_CAPABILITY.maxPendingRequests);
      controller.abort();
      await expect(opening).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      expect(sent(AttractapEventType.BLE_SESSION_CLOSE).map((message) => message.payload.sessionId)).toEqual([
        open.payload.sessionId,
      ]);
      await flush();
      expect(spec.harness.driver.liveLinks).toBe(0);
      await spec.harness.advance(30_000);
      await released;
    });

    it('bounds the closes beyond the cap as well', async () => {
      const session = await ble().openSession((await endpoint()).id);
      firmware().silent = true;
      const cap = FAKE_READER_BLE_CAPABILITY.maxPendingRequests;
      const released = fillWithAbandoned(session.id, cap);
      const channel = spec.channel();
      const closes = Array.from({ length: BLE_CLOSE_RESERVE }, (_, index) => channel.closeOnReader(`stale-${index}`));
      expect(channel.pendingCount).toBe(cap + BLE_CLOSE_RESERVE);
      expect(sent(AttractapEventType.BLE_SESSION_CLOSE)).toHaveLength(BLE_CLOSE_RESERVE);
      // One more close is not sent: the reader is freed locally instead.
      await channel.closeOnReader('stale-extra');
      expect(sent(AttractapEventType.BLE_SESSION_CLOSE)).toHaveLength(BLE_CLOSE_RESERVE);
      await spec.harness.advance(6_000);
      await Promise.all([...closes, released]);
      expect(channel.pendingCount).toBe(0);
      firmware().silent = false;
      await session.close();
      expect(sent(AttractapEventType.BLE_SESSION_CLOSE)).toHaveLength(BLE_CLOSE_RESERVE + 1);
    });
  });

  describe('scan results', () => {
    const advertisement = (address: string, rssi: number) => ({
      address,
      addressType: 'public',
      rssi,
      serviceUuids: [`0000${PROFILE.services[0].uuid}-0000-1000-8000-00805f9b34fb`],
      manufacturerData: [],
    });

    it('keeps the first entry per address and deduplicates before the cap', async () => {
      socket().state.ble = parseBleCapability({ ...FAKE_READER_BLE_CAPABILITY, maxScanResults: 2 });
      firmware().silent = true;
      const scanning = ble().scan(1, PROFILE.id);
      await until(() => sent(AttractapEventType.BLE_SCAN).length === 1);
      const [scan] = sent(AttractapEventType.BLE_SCAN);
      expect(scan.payload.maxResults).toBe(2);
      fromReader(socket(), AttractapEventType.BLE_SCAN_RESULT, {
        v: 1,
        sessionId: scan.payload.sessionId,
        requestId: scan.payload.requestId,
        ok: true,
        advertisements: [
          advertisement(ADDRESS, -80),
          advertisement(ADDRESS, -40),
          advertisement(OTHER, -60),
          advertisement('AA:BB:CC:DD:EE:03', -50),
        ],
      });
      const results = await scanning;
      expect(results.map(({ address, rssi }) => ({ address, rssi }))).toEqual([
        { address: ADDRESS, rssi: -80 },
        { address: OTHER, rssi: -60 },
      ]);
    });
  });

  describe('the negotiated MTU', () => {
    it.each([
      [9000, undefined, PLUGIN_BLE_LIMITS.mtuMax],
      [9000, 185, 185],
      [undefined, undefined, PLUGIN_BLE_LIMITS.mtuMin],
      [10, undefined, PLUGIN_BLE_LIMITS.mtuMin],
      ['247', undefined, PLUGIN_BLE_LIMITS.mtuMin],
      [247, undefined, 247],
    ])('reports %j from the reader (reader maximum %j) as %d', async (mtu, maxMtu, expected) => {
      if (maxMtu) socket().state.ble = parseBleCapability({ ...FAKE_READER_BLE_CAPABILITY, maxMtu });
      const created = await endpoint();
      firmware().silent = true;
      const opening = ble().openSession(created.id);
      await until(() => sent(AttractapEventType.BLE_SESSION_OPEN).length === 1);
      spec.answer(sent(AttractapEventType.BLE_SESSION_OPEN)[0], { ok: true, mtu });
      const session = await opening;
      expect(session.mtu).toBe(expected);
      firmware().silent = false;
      await session.close();
    });
  });

  describe('a silent reader', () => {
    it('times out a connect, cancels and closes it on the reader, and frees the reader once it answered', async () => {
      const created = await endpoint();
      firmware().silent = true;
      const opening = capture(ble().openSession(created.id, { connectTimeoutMs: 5_000 }));
      await until(() => sent(AttractapEventType.BLE_SESSION_OPEN).length === 1);
      const [open] = sent(AttractapEventType.BLE_SESSION_OPEN);
      await spec.harness.advance(5_000);
      await expect(opening).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      expect(sent(AttractapEventType.BLE_CANCEL).map((message) => message.payload.requestId)).toEqual([
        open.payload.requestId,
      ]);
      const [close] = sent(AttractapEventType.BLE_SESSION_CLOSE);
      expect(close.payload.sessionId).toBe(open.payload.sessionId);
      // The reader is held until it confirmed the close: no second connect races the first one's disconnect.
      await expect(ble().openSession(created.id)).rejects.toMatchObject({ code: 'READER_BUSY', detail: 'session' });
      firmware().silent = false;
      spec.answer(close, { ok: true });
      await flush();
      const session = await ble().openSession(created.id);
      await session.close();
    });

    it('times out an operation, cancels it on the reader and drops its late result', async () => {
      const session = await ble().openSession((await endpoint()).id);
      firmware().silent = true;
      const reading = capture(session.read('info', { timeoutMs: 2_000 }));
      await flush();
      const [read] = sent(AttractapEventType.BLE_READ);
      await spec.harness.advance(2_000);
      await expect(reading).resolves.toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
      expect(sent(AttractapEventType.BLE_CANCEL).map((message) => message.payload.requestId)).toEqual([
        read.payload.requestId,
      ]);
      expect(() => spec.answer(read, { ok: true, value: 'CQ==' })).not.toThrow();
      firmware().silent = false;
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('drops the late result of a cancelled read and counts the read once', async () => {
      const { registry } = spec.withMetrics();
      const session = await ble().openSession((await endpoint()).id);
      firmware().silent = true;
      const controller = new AbortController();
      const reading = capture(session.read('info', { signal: controller.signal }));
      await flush();
      const [read] = sent(AttractapEventType.BLE_READ);
      controller.abort();
      await expect(reading).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      expect(() => spec.answer(read, { ok: true, value: 'CQ==' })).not.toThrow();
      firmware().silent = false;
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      const text = await registry.metrics();
      expect(text).toContain('attraccess_plugin_ble_operations_total{operation="read",outcome="CANCELLED"} 1');
      expect(text).toContain('attraccess_plugin_ble_operations_total{operation="read",outcome="ok"} 1');
      await session.close();
    });
  });
});

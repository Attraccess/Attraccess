import type { PluginBleContext, PluginBleSession } from '@attraccess/plugins-backend-sdk';
import { Registry } from 'prom-client';
import { createPluginBleMetrics } from '../../../../metrics/definitions/plugin-ble.metrics';
import {
  createHostBleHarness,
  type HostBleHarness,
} from '../../../../plugin-system/ble/__test__/ble-host-harness.test-fixture';
import { AttractapEventType, type AttractapEvent } from '../../websocket.types';
import { decodeBleBytes, parseBleCapability } from './ble-wire';
import { BLE_MAX_PENDING_REQUESTS, BLE_WRITE_WINDOW, type ReaderBleChannel } from './reader-ble-channel';

const SERVICE = 'fff0';
const ADDRESS = 'AA:BB:CC:DD:EE:01';
const OTHER = 'AA:BB:CC:DD:EE:02';
const capture = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: { code?: string; detail?: string }) => ({ ok: false as const, error }),
  );

const PROFILE = {
  id: 'demo',
  advertisement: { serviceUuids: [SERVICE] },
  services: [
    {
      uuid: SERVICE,
      characteristics: [
        {
          key: 'info',
          uuid: 'fff1',
          operations: ['read' as const, 'write' as const],
          maxReadBytes: 16,
          maxWriteBytes: 8,
        },
        { key: 'events', uuid: 'fff2', operations: ['notify' as const], maxNotificationBytes: 8 },
        { key: 'bulk', uuid: 'fff3', operations: ['writeWithoutResponse' as const], maxWriteBytes: 512 },
        { key: 'slow', uuid: 'fff4', operations: ['read' as const], maxReadBytes: 4 },
      ],
    },
  ],
  limits: { maxSessionMs: 900_000, maxNotificationQueue: 4 },
};

describe('ReaderBleDriver (plugin BLE over the reader websocket)', () => {
  let harness: HostBleHarness;
  let ble: PluginBleContext;
  let other: PluginBleContext;

  /** The value, or a test failure: fixtures that must exist. */
  const present = <T>(value: T | undefined | null): T => {
    if (value === undefined || value === null) throw new Error('expected a value');
    return value;
  };
  const reader = (readerId = 1) => present(harness.readers.get(readerId));
  const driver = () => present(harness.readerDriver);
  const firmware = (readerId = 1) => reader(readerId).firmware;
  const socket = (readerId = 1) => reader(readerId).socket;
  const sent = (type: AttractapEventType, readerId = 1) =>
    firmware(readerId).received.filter((message) => message.type === type);
  /** A message the reader (firmware) sends, injected as if it arrived on `target`'s socket. */
  const fromReader = (target: ReturnType<typeof socket>, type: AttractapEventType, payload: Record<string, unknown>) =>
    driver().handleMessage(target, { type, payload } as AttractapEvent['data']);
  const endpoint = (address = ADDRESS, ctx = ble) =>
    ctx.createEndpoint({ readerId: 1, address, addressType: 'public', profileId: PROFILE.id });
  const flush = () => harness.advance(0);
  /** Waits through real I/O (the endpoint lookups run on SQLite) until `condition` holds. */
  const until = async (condition: () => boolean) => {
    for (let i = 0; i < 500 && !condition(); i++) await new Promise((resolve) => setImmediate(resolve));
    expect(condition()).toBe(true);
  };

  beforeEach(async () => {
    harness = await createHostBleHarness({ transport: 'reader-websocket' });
    ble = harness.contextFor('plugin-a');
    other = harness.contextFor('plugin-b');
    await harness.addReader({ readerId: 1, name: 'Workshop', allowPluginBle: true });
    for (const address of [ADDRESS, OTHER]) {
      harness.addPeripheral({
        readerId: 1,
        address,
        addressType: 'public',
        advertisement: { name: 'Demo', serviceUuids: [SERVICE] },
        characteristics: { fff1: { value: Uint8Array.of(1, 2, 3) }, fff2: {}, fff3: {}, fff4: { delayMs: 20_000 } },
      });
    }
    ble.registerProfile(PROFILE);
    other.registerProfile(PROFILE);
  });

  afterEach(() => harness.dispose());

  describe('capability negotiation', () => {
    it.each([
      [undefined, 'no-ble-capability'],
      ['yes', 'no-ble-capability'],
      [{ version: 2, operations: [] }, 'protocol-version:2'],
      [{ version: '1' }, 'protocol-version:invalid'],
      [{ version: 1, operations: ['scan', 'connect', 'read', 'write'] }, 'missing-operation:writeWithoutResponse'],
    ])('reports READER_UNSUPPORTED for capabilities.ble %j (%s)', async (capability, detail) => {
      socket().state.ble = parseBleCapability(capability);
      const created = await endpoint();
      await expect(ble.openSession(created.id)).rejects.toMatchObject({
        code: 'READER_UNSUPPORTED',
        retryable: false,
        detail,
      });
      await expect(ble.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'READER_UNSUPPORTED', detail });
      expect((await ble.listReaders())[0].available).toBe(false);
      expect(firmware().received).toEqual([]);
    });

    it('treats a reader that has not sent its firmware info yet, or must pair, as offline', async () => {
      socket().state.ble = undefined;
      await expect(ble.scan(1, PROFILE.id)).rejects.toMatchObject({
        code: 'READER_OFFLINE',
        detail: 'firmware-info-pending',
      });
      socket().state.ble = parseBleCapability(undefined);
      socket().state.pairingRequired = true;
      await expect(ble.scan(1, PROFILE.id)).rejects.toMatchObject({
        code: 'READER_OFFLINE',
        detail: 'pairing-required',
      });
    });

    it('clamps announced limits and refuses profiles larger than the reader allowlist', async () => {
      socket().state.ble = parseBleCapability({
        version: 1,
        operations: ['scan', 'connect', 'read', 'write', 'writeWithoutResponse', 'subscribe', 'unsubscribe', 'cancel'],
        maxMtu: 9000,
        maxAllowlistEntries: 2,
      });
      expect(socket().state.ble).toMatchObject({ capability: { maxMtu: 517, maxAllowlistEntries: 2 } });
      const created = await endpoint();
      await expect(ble.openSession(created.id)).rejects.toMatchObject({
        code: 'READER_UNSUPPORTED',
        detail: 'allowlist-too-large:4',
      });
    });
  });

  describe('one BLE owner per reader', () => {
    it('rejects open-vs-open, scan-vs-session and scan-vs-scan with READER_BUSY at once', async () => {
      const mine = await ble.openSession((await endpoint()).id);
      const theirs = await endpoint(OTHER, other);
      await expect(other.openSession(theirs.id)).rejects.toMatchObject({ code: 'READER_BUSY', retryable: true });
      await expect(ble.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'READER_BUSY', detail: 'session' });
      await mine.close();

      firmware().silent = true;
      const scanning = capture(ble.scan(1, PROFILE.id));
      await until(() => sent(AttractapEventType.BLE_SCAN).length === 1);
      await expect(other.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'READER_BUSY', detail: 'scan' });
      await expect(other.openSession(theirs.id)).rejects.toMatchObject({ code: 'READER_BUSY', detail: 'scan' });
      const [scan] = sent(AttractapEventType.BLE_SCAN);
      firmware().silent = false;
      fromReader(socket(), AttractapEventType.BLE_SCAN_RESULT, {
        v: 1,
        sessionId: scan.payload.sessionId,
        requestId: scan.payload.requestId,
        ok: true,
        advertisements: [],
      });
      await expect(scanning).resolves.toMatchObject({ ok: true });
      // Free again: nothing was queued behind the rejected calls.
      const later = await other.openSession(theirs.id);
      expect(sent(AttractapEventType.BLE_SESSION_OPEN)).toHaveLength(2);
      await later.close();
    });

    it('refuses BLE work while the reader updates its firmware', async () => {
      socket().state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 7 };
      await expect(ble.openSession((await endpoint()).id)).rejects.toMatchObject({
        code: 'READER_BUSY',
        detail: 'ota',
      });
      await expect(ble.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'READER_BUSY', detail: 'ota' });
    });

    it('sends the profile as the reader allowlist with the session deadlines', async () => {
      const session = await ble.openSession((await endpoint()).id, { leaseMs: 600_000, connectTimeoutMs: 5_000 });
      const [open] = sent(AttractapEventType.BLE_SESSION_OPEN);
      expect(open.payload).toMatchObject({
        v: 1,
        sessionId: session.id,
        address: ADDRESS,
        addressType: 'public',
        connectTimeoutMs: 5_000,
        leaseMs: 600_000,
      });
      expect(open.payload.allowlist).toEqual([
        { s: expect.stringMatching(/^0000fff0-/), c: expect.stringMatching(/^0000fff1-/), ops: 3, r: 16, w: 8, n: 0 },
        { s: expect.any(String), c: expect.stringMatching(/^0000fff2-/), ops: 8, r: 0, w: 0, n: 8 },
        { s: expect.any(String), c: expect.stringMatching(/^0000fff3-/), ops: 4, r: 0, w: 512, n: 0 },
        { s: expect.any(String), c: expect.stringMatching(/^0000fff4-/), ops: 1, r: 4, w: 0, n: 0 },
      ]);
      await session.close();
    });
  });

  describe('sessions are bound to the socket instance', () => {
    it('fails everything on the socket when it closes, and the reconnected reader is free', async () => {
      const session = await ble.openSession((await endpoint()).id);
      const pending = capture(session.read('slow'));
      await flush();
      const lost = firmware();
      harness.reconnectReader(1);
      await expect(pending).resolves.toMatchObject({
        ok: false,
        error: { code: 'DISCONNECTED', detail: 'reader-link-lost' },
      });
      await expect(session.closed).resolves.toEqual({ reason: 'disconnected' });
      expect(lost.hasSession).toBe(false);
      const again = await ble.openSession((await ble.listEndpoints())[0].id);
      await expect(again.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await again.close();
    });

    it('never lets a stale socket complete, reject or close work of the reconnected reader (ATT-1031)', async () => {
      const first = await ble.openSession((await endpoint()).id);
      const staleSocket = socket();
      const staleFirmware = firmware();
      staleFirmware.silent = true;
      const stalled = capture(first.read('info'));
      await flush();
      // The reader reconnects; the old socket has not closed yet (half-open TCP).
      (staleSocket as unknown as { readyState: number }).readyState = 1;
      const replacement = reader(1);
      harness.reconnectReader(1);
      const fresh = reader(1);
      expect(fresh.socket).not.toBe(replacement.socket);
      await expect(stalled).resolves.toMatchObject({ ok: false, error: { code: 'DISCONNECTED' } });

      const second = await other.openSession((await endpoint(OTHER, other)).id);
      fresh.firmware.silent = true;
      const pending = capture(second.read('info'));
      await flush();
      const [read] = fresh.firmware.received.filter((message) => message.type === AttractapEventType.BLE_READ);
      // Late answers and endings on the stale socket, even with the new socket's ids, touch nothing.
      fromReader(staleSocket, AttractapEventType.BLE_RESULT, {
        v: 1,
        sessionId: second.id,
        requestId: read.payload.requestId,
        ok: true,
        value: 'AQ==',
      });
      fromReader(staleSocket, AttractapEventType.BLE_SESSION_ENDED, {
        v: 1,
        sessionId: second.id,
        reason: 'disconnected',
      });
      driver().socketClosed(staleSocket);
      await flush();
      expect(harness.openSessions()).toHaveLength(1);
      fresh.firmware.silent = false;
      fromReader(fresh.socket, AttractapEventType.BLE_RESULT, {
        v: 1,
        sessionId: second.id,
        requestId: read.payload.requestId,
        ok: true,
        value: 'BwgJ',
      });
      await expect(pending).resolves.toEqual({ ok: true, value: Uint8Array.of(7, 8, 9) });
      await second.close();
    });

    it('drops answers for unknown sessions, unknown requests and unknown protocol versions', async () => {
      const session = await ble.openSession((await endpoint()).id);
      firmware().silent = true;
      const pending = capture(session.read('info'));
      await flush();
      const [read] = sent(AttractapEventType.BLE_READ);
      const answer = { sessionId: session.id, requestId: read.payload.requestId, ok: true, value: 'AQ==' };
      fromReader(socket(), AttractapEventType.BLE_RESULT, { ...answer, v: 2 });
      fromReader(socket(), AttractapEventType.BLE_RESULT, { ...answer, v: 1, sessionId: 'other' });
      fromReader(socket(), AttractapEventType.BLE_RESULT, { ...answer, v: 1, requestId: 9999 });
      await flush();
      let settled = false;
      void pending.then(() => (settled = true));
      await flush();
      expect(settled).toBe(false);
      fromReader(socket(), AttractapEventType.BLE_RESULT, { ...answer, v: 1 });
      await expect(pending).resolves.toEqual({ ok: true, value: Uint8Array.of(1) });
      firmware().silent = false;
      await session.close();
    });
  });

  describe('cancellation', () => {
    it('sends BLE_CANCEL for an aborted operation and keeps the session', async () => {
      const session = await ble.openSession((await endpoint()).id);
      const controller = new AbortController();
      const pending = capture(session.read('slow', { signal: controller.signal }));
      await flush();
      controller.abort();
      await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      const [read] = sent(AttractapEventType.BLE_READ);
      expect(sent(AttractapEventType.BLE_CANCEL)).toEqual([
        {
          type: AttractapEventType.BLE_CANCEL,
          payload: { v: 1, sessionId: session.id, requestId: read.payload.requestId },
        },
      ]);
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('cancels a pending connect on the reader and frees the reader once it confirmed', async () => {
      harness.driver.connectDelayMs = 10_000;
      const created = await endpoint();
      const controller = new AbortController();
      const opening = capture(ble.openSession(created.id, { signal: controller.signal }));
      await until(() => sent(AttractapEventType.BLE_SESSION_OPEN).length === 1);
      await harness.advance(1);
      controller.abort();
      await expect(opening).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      const [open] = sent(AttractapEventType.BLE_SESSION_OPEN);
      expect(sent(AttractapEventType.BLE_CANCEL)[0].payload).toMatchObject({ requestId: open.payload.requestId });
      // The close right behind the cancel disconnects whatever came of the connect.
      expect(sent(AttractapEventType.BLE_SESSION_CLOSE)[0].payload).toMatchObject({
        sessionId: open.payload.sessionId,
      });
      await flush();
      expect(harness.driver.liveLinks).toBe(0);
      harness.driver.connectDelayMs = 0;
      const session = await ble.openSession(created.id);
      await session.close();
    });

    it('cancels a scan on the reader, rejects at once and frees the reader once it answered', async () => {
      const controller = new AbortController();
      firmware().silent = true;
      const scanning = capture(ble.scan(1, PROFILE.id, { signal: controller.signal }));
      await until(() => sent(AttractapEventType.BLE_SCAN).length === 1);
      controller.abort();
      await expect(scanning).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      const [scan] = sent(AttractapEventType.BLE_SCAN);
      expect(sent(AttractapEventType.BLE_CANCEL)[0].payload).toMatchObject({ requestId: scan.payload.requestId });
      await expect(ble.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'READER_BUSY' });
      fromReader(socket(), AttractapEventType.BLE_SCAN_RESULT, {
        v: 1,
        sessionId: scan.payload.sessionId,
        requestId: scan.payload.requestId,
        ok: false,
        error: { code: 'CANCELLED' },
      });
      firmware().silent = false;
      await expect(ble.scan(1, PROFILE.id)).resolves.toHaveLength(2);
    });

    it('frees the reader after the deadline when it never answers a cancelled scan', async () => {
      const controller = new AbortController();
      firmware().silent = true;
      const scanning = capture(ble.scan(1, PROFILE.id, { signal: controller.signal, durationMs: 1_000 }));
      await until(() => sent(AttractapEventType.BLE_SCAN).length === 1);
      controller.abort();
      await scanning;
      await expect(ble.scan(1, PROFILE.id)).rejects.toMatchObject({ code: 'READER_BUSY' });
      await harness.advance(6_000);
      firmware().silent = false;
      await expect(ble.scan(1, PROFILE.id)).resolves.toHaveLength(2);
    });
  });

  describe('notifications', () => {
    let session: PluginBleSession;
    let subscriptionId: number;
    const notify = (payload: Record<string, unknown>) =>
      fromReader(socket(), AttractapEventType.BLE_NOTIFICATION, {
        v: 1,
        sessionId: session.id,
        subscriptionId,
        ...payload,
      });

    beforeEach(async () => {
      session = await ble.openSession((await endpoint()).id);
    });

    const subscribe = async () => {
      const stream = await session.subscribe('events');
      subscriptionId = present(sent(AttractapEventType.BLE_SUBSCRIBE).at(-1)).payload.requestId as number;
      return stream;
    };

    it('delivers in order and fails the stream on a gap or duplicate', async () => {
      const stream = await subscribe();
      notify({ seq: 1, value: 'AQ==' });
      notify({ seq: 2, value: 'Ag==' });
      expect((await stream.next()).value).toEqual(Uint8Array.of(1));
      expect((await stream.next()).value).toEqual(Uint8Array.of(2));
      notify({ seq: 2, value: 'Aw==' });
      await expect(stream.next()).rejects.toMatchObject({ code: 'INTERNAL', detail: 'malformed-notification' });
      await flush();
      expect(sent(AttractapEventType.BLE_UNSUBSCRIBE)).toHaveLength(1);
      await session.close();
    });

    it.each([
      [{ seq: 1, error: { code: 'NOTIFICATION_OVERFLOW', detail: 'queue' } }, 'NOTIFICATION_OVERFLOW'],
      [{ seq: 1, error: { code: 'PAYLOAD_TOO_LARGE' } }, 'PAYLOAD_TOO_LARGE'],
      [{ seq: 1, value: 'AAAAAAAAAAAA' }, 'PAYLOAD_TOO_LARGE'],
      [{ seq: 1, value: 'not base64!' }, 'PAYLOAD_TOO_LARGE'],
      [{ seq: 3, value: 'AQ==' }, 'INTERNAL'],
    ])('fails the stream, never drops silently: %j', async (payload, code) => {
      const stream = await subscribe();
      notify(payload);
      await expect(stream.next()).rejects.toMatchObject({ code });
      await session.close();
    });

    it('routes only to the owning session and subscription', async () => {
      const stream = await subscribe();
      fromReader(socket(), AttractapEventType.BLE_NOTIFICATION, {
        v: 1,
        sessionId: 'someone-else',
        subscriptionId,
        seq: 1,
        value: 'CQ==',
      });
      fromReader(socket(), AttractapEventType.BLE_NOTIFICATION, {
        v: 1,
        sessionId: session.id,
        subscriptionId: subscriptionId + 100,
        seq: 1,
        value: 'CQ==',
      });
      notify({ seq: 1, value: 'AQ==' });
      expect((await stream.next()).value).toEqual(Uint8Array.of(1));
      await session.close();
    });

    it('rejects a pending wait with CANCELLED when its signal aborts', async () => {
      const stream = await subscribe();
      const controller = new AbortController();
      const waiting = capture(stream.next({ signal: controller.signal, timeoutMs: 60_000 }));
      controller.abort();
      await expect(waiting).resolves.toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
      notify({ seq: 1, value: 'AQ==' });
      expect((await stream.next()).value).toEqual(Uint8Array.of(1));
      await session.close();
    });
  });

  describe('errors from the reader', () => {
    it.each([
      ['DEVICE_NOT_FOUND', 'connect-timeout', true],
      ['CONNECTION_FAILED', 'hci:0x3e', true],
      ['DISCONNECTED', 'reason:0x08', true],
      ['GATT_ERROR', 'att:0x0a', false],
      ['GATT_ERROR', 'characteristic-not-found', false],
      ['TIMEOUT', 'nimble:rc=13', true],
      ['READER_OFFLINE', 'ble-init-failed', true],
      ['READER_BUSY', 'ota', true],
      ['INTERNAL', 'nimble:rc=6', false],
    ])('passes %s (%s) through with its safe detail', async (code, detail, retryable) => {
      const created = await endpoint();
      harness.driver.failNext('connect', code as never, detail);
      await expect(ble.openSession(created.id)).rejects.toMatchObject({ code, detail, retryable });
      expect(harness.openSessions()).toEqual([]);
      const session = await ble.openSession(created.id);
      await session.close();
    });

    it('maps unknown codes to INTERNAL and drops unsafe details', async () => {
      const session = await ble.openSession((await endpoint()).id);
      firmware().silent = true;
      const reading = capture(session.read('info'));
      await flush();
      const [read] = sent(AttractapEventType.BLE_READ);
      fromReader(socket(), AttractapEventType.BLE_RESULT, {
        v: 1,
        sessionId: session.id,
        requestId: read.payload.requestId,
        ok: false,
        error: { code: 'FANCY', detail: 'bytes {0x01,0x02}' },
      });
      await expect(reading).resolves.toMatchObject({
        ok: false,
        error: { code: 'INTERNAL', detail: 'unknown-reader-code' },
      });
      firmware().silent = false;
      await session.close();
    });

    it('rejects a read result above the bound before decoding it', async () => {
      const session = await ble.openSession((await endpoint()).id);
      firmware().silent = true;
      const reading = capture(session.read('slow'));
      await flush();
      const [read] = sent(AttractapEventType.BLE_READ);
      fromReader(socket(), AttractapEventType.BLE_RESULT, {
        v: 1,
        sessionId: session.id,
        requestId: read.payload.requestId,
        ok: true,
        value: 'A'.repeat(4096),
      });
      await expect(reading).resolves.toMatchObject({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE' } });
      firmware().silent = false;
      await session.close();
    });
  });

  describe('bounds', () => {
    it('length-checks base64 before decoding', () => {
      expect(decodeBleBytes('AQID', 3)).toEqual(Uint8Array.of(1, 2, 3));
      expect(decodeBleBytes('AQIDBA==', 3)).toBeNull();
      expect(decodeBleBytes('A'.repeat(1_000_000), 512)).toBeNull();
      expect(decodeBleBytes('AQI', 3)).toBeNull();
      expect(decodeBleBytes(42, 3)).toBeNull();
    });

    it('caps the requests waiting for one reader connection', async () => {
      const session = await ble.openSession((await endpoint()).id);
      firmware().silent = true;
      const channels = (driver() as unknown as { channels: WeakMap<object, ReaderBleChannel> }).channels;
      const channel = present(channels.get(socket()));
      const results: Array<Promise<unknown>> = [];
      for (let i = channel.pendingCount; i < BLE_MAX_PENDING_REQUESTS; i++) {
        results.push(
          channel.request(AttractapEventType.BLE_READ, session.id, {}, 'read').result.catch(() => undefined),
        );
      }
      expect(() => channel.request(AttractapEventType.BLE_READ, session.id, {}, 'read')).toThrow(
        expect.objectContaining({ code: 'READER_BUSY', detail: 'queue-full' }),
      );
      // Unanswered requests do not stay forever: their deadline frees them.
      await harness.advance(15_000);
      await Promise.all(results);
      expect(channel.pendingCount).toBe(0);
      firmware().silent = false;
      await session.close();
    });

    it('pipelines writes without response in a bounded window and reports a late failure on the next call', async () => {
      const session = await ble.openSession((await endpoint()).id);
      firmware().silent = true;
      const writes = Array.from({ length: BLE_WRITE_WINDOW + 2 }, (_, i) =>
        capture(session.write('bulk', Uint8Array.of(i), { withoutResponse: true })),
      );
      await flush();
      expect(sent(AttractapEventType.BLE_WRITE)).toHaveLength(BLE_WRITE_WINDOW);
      const writeRequests = sent(AttractapEventType.BLE_WRITE);
      // The reader confirms the first and fails the second: the window moves on, the failure is kept.
      fromReader(socket(), AttractapEventType.BLE_RESULT, {
        v: 1,
        sessionId: session.id,
        requestId: writeRequests[0].payload.requestId,
        ok: true,
      });
      fromReader(socket(), AttractapEventType.BLE_RESULT, {
        v: 1,
        sessionId: session.id,
        requestId: writeRequests[1].payload.requestId,
        ok: false,
        error: { code: 'GATT_ERROR', detail: 'nimble:rc=6' },
      });
      await flush();
      // The first write call after the failure reports it instead of being sent; the one behind it goes out.
      expect(sent(AttractapEventType.BLE_WRITE)).toHaveLength(BLE_WRITE_WINDOW + 1);
      const failed = (await Promise.all(writes)).filter((outcome) => !outcome.ok);
      expect(failed).toEqual([
        { ok: false, error: expect.objectContaining({ code: 'GATT_ERROR', detail: 'nimble:rc=6' }) },
      ]);
      firmware().silent = false;
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('never sends a frame larger than a legacy reader can parse', async () => {
      const session = await ble.openSession((await endpoint()).id);
      await session.write('bulk', new Uint8Array(244), { withoutResponse: true });
      const frames = firmware().received.map((message) =>
        Buffer.byteLength(JSON.stringify({ event: 'EVENT', data: message })),
      );
      expect(Math.max(...frames)).toBeLessThanOrEqual(4096);
      await session.close();
    });
  });

  describe('cleanup', () => {
    it('is idempotent across close, reader end and socket loss in any order', async () => {
      for (const order of [
        ['close', 'ended', 'socket'],
        ['ended', 'close', 'socket'],
        ['socket', 'close', 'ended'],
      ]) {
        const session = await ble.openSession((await ble.listEndpoints()).at(0)?.id ?? (await endpoint()).id);
        const pending = capture(session.read('slow'));
        await flush();
        const target = socket();
        for (const step of order) {
          if (step === 'close') void session.close();
          if (step === 'ended')
            fromReader(target, AttractapEventType.BLE_SESSION_ENDED, {
              v: 1,
              sessionId: session.id,
              reason: 'disconnected',
            });
          if (step === 'socket') harness.reconnectReader(1);
          await flush();
        }
        await harness.advance(20_000);
        await expect(pending).resolves.toMatchObject({ ok: false });
        await expect(session.closed).resolves.toMatchObject({ reason: expect.any(String) });
        expect(harness.openSessions()).toEqual([]);
      }
      expect(harness.driver.liveLinks).toBe(0);
    });
  });

  describe('metrics', () => {
    it('counts notifications by outcome without reader or session labels', async () => {
      const registry = new Registry();
      const metrics = createPluginBleMetrics(registry);
      (harness.readerDriver as unknown as { metrics: unknown }).metrics = metrics;
      const session = await ble.openSession((await endpoint()).id);
      const stream = await session.subscribe('events');
      harness.notify(ADDRESS, 'fff2', Uint8Array.of(1));
      await stream.next();
      harness.notify(ADDRESS, 'fff2', new Uint8Array(9));
      await expect(stream.next()).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      const text = await registry.metrics();
      expect(text).toContain('attraccess_plugin_ble_notifications_total{outcome="delivered"} 1');
      expect(text).toContain('attraccess_plugin_ble_notifications_total{outcome="oversized"} 1');
      // Only low-cardinality labels: no reader, endpoint or session ids.
      expect(text).not.toMatch(/\{[^}]*(?:reader|endpoint|session)[^}]*\}/);
      await session.close();
    });
  });
});

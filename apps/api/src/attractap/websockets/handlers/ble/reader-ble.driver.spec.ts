import type { PluginBleContext, PluginBleSession } from '@attraccess/plugins-backend-sdk';
import type { HostBleHarness } from '../../../../plugin-system/ble/__test__/ble-host-harness.test-fixture';
import { AttractapEventType } from '../../websocket.types';
import { decodeBleBytes, parseBleCapability, readBleBytes } from './ble-wire';
import { BLE_CONNECT_REPORT_MARGIN_MS, BLE_WRITE_WINDOW } from './reader-ble-channel';
import { FAKE_READER_BLE_CAPABILITY } from './__test__/fake-ble-reader.test-fixture';
import { ADDRESS, capture, OTHER, PROFILE, useReaderBleSpec } from './__test__/reader-ble-spec.test-fixture';

describe('ReaderBleDriver (plugin BLE over the reader websocket)', () => {
  const spec = useReaderBleSpec();
  const { present, reader, driver, firmware, socket, sent, fromReader, endpoint, flush, until } = spec;
  let harness: HostBleHarness;
  let ble: PluginBleContext;
  let other: PluginBleContext;

  beforeEach(() => {
    ({ harness, ble, other } = spec);
  });

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

    it.each([
      ['a legacy token connection', { transport: 'legacy' as const, pairingRequired: false }],
      ['a connection of unknown transport', { transport: undefined, pairingRequired: false }],
      ['a session that has not signed in yet', { transport: 'session' as const, pairingRequired: undefined }],
    ])('offers no BLE on %s, even with a BLE capable firmware', async (_name, connection) => {
      socket().transport = connection.transport;
      socket().state.pairingRequired = connection.pairingRequired;
      await expect(ble.scan(1, PROFILE.id)).rejects.toMatchObject({
        code: 'READER_OFFLINE',
        detail: 'pairing-required',
      });
      expect((await ble.listReaders())[0].available).toBe(false);
      expect(firmware().received).toEqual([]);
    });

    it('clamps announced limits and refuses profiles larger than the reader allowlist', async () => {
      socket().state.ble = parseBleCapability({
        version: 1,
        operations: ['scan', 'connect', 'read', 'write', 'writeWithoutResponse', 'subscribe', 'unsubscribe', 'cancel'],
        maxMtu: 9000,
        maxAllowlistEntries: 2,
      });
      expect(socket().state.ble).toMatchObject({ capability: { maxMtu: 517, maxAllowlistEntries: 2 } });
      // Older firmware does not announce its queue: the API's own cap applies.
      expect(socket().state.ble).toMatchObject({ capability: { maxPendingRequests: 32 } });
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
        // The reader stops a moment before the host deadline, so its own answer reaches the plugin.
        connectTimeoutMs: 5_000 - BLE_CONNECT_REPORT_MARGIN_MS,
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

    it('releases the work of a half-open socket as soon as the reader announces itself on a new one', async () => {
      const created = await endpoint();
      const session = await ble.openSession(created.id);
      const stream = await session.subscribe('events');
      const waiting = capture(stream.next({ timeoutMs: 60_000 }));
      const pending = capture(session.read('slow'));
      await flush();
      const stale = socket();
      // A reader reset: the old TCP connection does not close until the heartbeat times out.
      harness.reconnectReader(1, { halfOpen: true });
      expect(socket()).not.toBe(stale);
      expect(stale.readyState).toBe(1);
      driver().readerConnected(socket());
      await expect(pending).resolves.toMatchObject({
        ok: false,
        error: { code: 'DISCONNECTED', detail: 'reader-link-lost' },
      });
      await expect(waiting).resolves.toMatchObject({ ok: false, error: { code: 'DISCONNECTED' } });
      await expect(session.closed).resolves.toEqual({ reason: 'disconnected' });
      // The endpoint and the reader are free on the new connection at once.
      const again = await ble.openSession(created.id);
      await expect(again.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      // The old socket closing late does not touch the new session.
      driver().socketClosed(stale);
      await expect(again.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await again.close();
    });

    it('ignores answers, notifications and ends on a half-open stale socket, before and after it closes', async () => {
      const created = await endpoint();
      const stale = socket();
      harness.reconnectReader(1, { halfOpen: true });
      driver().readerConnected(socket());
      expect(stale.readyState).toBe(1);
      const session = await ble.openSession(created.id);
      const stream = await session.subscribe('events');
      const [subscribe] = sent(AttractapEventType.BLE_SUBSCRIBE);
      firmware().silent = true;
      let settled = false;
      const pending = capture(session.read('info')).finally(() => (settled = true));
      await flush();
      const [read] = sent(AttractapEventType.BLE_READ);
      const ids = { v: 1, sessionId: session.id };
      const injectOnStale = () => {
        fromReader(stale, AttractapEventType.BLE_RESULT, {
          ...ids,
          requestId: read.payload.requestId,
          ok: true,
          value: 'AQ==',
        });
        fromReader(stale, AttractapEventType.BLE_NOTIFICATION, {
          ...ids,
          subscriptionId: subscribe.payload.requestId,
          seq: 1,
          value: 'Ag==',
        });
        fromReader(stale, AttractapEventType.BLE_SESSION_ENDED, { ...ids, reason: 'disconnected' });
      };
      injectOnStale();
      await flush();
      expect(settled).toBe(false);
      expect(harness.openSessions()).toHaveLength(1);
      // The stale socket finally closes (heartbeat timeout); late frames before that are ignored just the same.
      (stale as unknown as { readyState: number }).readyState = 3;
      driver().socketClosed(stale);
      injectOnStale();
      await flush();
      expect(settled).toBe(false);
      expect(harness.openSessions()).toHaveLength(1);
      firmware().silent = false;
      spec.answer(read, { ok: true, value: 'BwgJ' });
      await expect(pending).resolves.toEqual({ ok: true, value: Uint8Array.of(7, 8, 9) });
      // seq 1 of the subscription is still unused: the stale notification never reached it.
      fromReader(socket(), AttractapEventType.BLE_NOTIFICATION, {
        ...ids,
        subscriptionId: subscribe.payload.requestId,
        seq: 1,
        value: 'Aw==',
      });
      expect((await stream.next()).value).toEqual(Uint8Array.of(3));
      await session.close();
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

    let registry: ReturnType<typeof spec.withMetrics>['registry'];

    beforeEach(async () => {
      ({ registry } = spec.withMetrics());
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
      // Reported by the reader.
      [
        { seq: 1, error: { code: 'NOTIFICATION_OVERFLOW', detail: 'queue' } },
        'NOTIFICATION_OVERFLOW',
        'queue',
        'overflow',
      ],
      [
        { seq: 1, error: { code: 'PAYLOAD_TOO_LARGE', detail: 'max-notification' } },
        'PAYLOAD_TOO_LARGE',
        'max-notification',
        'oversized',
      ],
      [{ seq: 1, error: { code: 'GATT_ERROR', detail: 'att:0x0e' } }, 'GATT_ERROR', 'att:0x0e', 'malformed'],
      // Found by the API.
      [{ seq: 1, value: 'AAAAAAAAAAAA' }, 'PAYLOAD_TOO_LARGE', 'max-notification', 'oversized'],
      [{ seq: 1, value: 'A'.repeat(4096) }, 'PAYLOAD_TOO_LARGE', 'max-notification', 'oversized'],
      [{ seq: 1, value: 'not base64!' }, 'INTERNAL', 'malformed-notification', 'malformed'],
      [{ seq: 1, value: 42 }, 'INTERNAL', 'malformed-notification', 'malformed'],
      [{ seq: 1 }, 'INTERNAL', 'malformed-notification', 'malformed'],
      [{ seq: 3, value: 'AQ==' }, 'INTERNAL', 'malformed-notification', 'malformed'],
      [{ value: 'AQ==' }, 'INTERNAL', 'malformed-notification', 'malformed'],
      [{ seq: 1.5, value: 'AQ==' }, 'INTERNAL', 'malformed-notification', 'malformed'],
      [{ seq: '1', value: 'AQ==' }, 'INTERNAL', 'malformed-notification', 'malformed'],
      [{ seq: 0, value: 'AQ==' }, 'INTERNAL', 'malformed-notification', 'malformed'],
    ])('fails the stream, never drops silently: %j', async (payload, code, detail, outcome) => {
      const stream = await subscribe();
      notify(payload);
      await expect(stream.next()).rejects.toMatchObject({ code, detail });
      const text = await registry.metrics();
      expect(text).toContain(`attraccess_plugin_ble_notifications_total{outcome="${outcome}"} 1`);
      expect(text).not.toContain('outcome="delivered"');
      await session.close();
    });

    it('ignores notifications and session ends with an unknown protocol version', async () => {
      const stream = await subscribe();
      notify({ v: 2, seq: 1, value: 'CQ==' });
      fromReader(socket(), AttractapEventType.BLE_SESSION_ENDED, { v: 2, sessionId: session.id, reason: 'ota' });
      await flush();
      expect(harness.openSessions()).toHaveLength(1);
      // seq 1 was not used up by the ignored message.
      notify({ seq: 1, value: 'AQ==' });
      expect((await stream.next()).value).toEqual(Uint8Array.of(1));
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

    it('reports DEVICE_NOT_FOUND, not TIMEOUT, when the reader never saw the device before the deadline', async () => {
      const created = await endpoint();
      // A short deadline is passed through unchanged.
      const quick = await ble.openSession(created.id, { connectTimeoutMs: 1_500 });
      expect(sent(AttractapEventType.BLE_SESSION_OPEN)[0].payload.connectTimeoutMs).toBe(1_500);
      await quick.close();
      firmware().silent = true;
      const opening = capture(ble.openSession(created.id, { connectTimeoutMs: 5_000 }));
      await until(() => sent(AttractapEventType.BLE_SESSION_OPEN).length === 2);
      const open = sent(AttractapEventType.BLE_SESSION_OPEN)[1];
      // The reader's connect window ends, and its answer takes a Wi-Fi round trip.
      await harness.advance((open.payload.connectTimeoutMs as number) + 300);
      fromReader(socket(), AttractapEventType.BLE_RESULT, {
        v: 1,
        sessionId: open.payload.sessionId,
        requestId: open.payload.requestId,
        ok: false,
        error: { code: 'DEVICE_NOT_FOUND', detail: 'connect-timeout' },
      });
      await expect(opening).resolves.toMatchObject({
        ok: false,
        error: { code: 'DEVICE_NOT_FOUND', detail: 'connect-timeout', retryable: true },
      });
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
      await expect(reading).resolves.toMatchObject({
        ok: false,
        error: { code: 'PAYLOAD_TOO_LARGE', detail: 'max-read' },
      });
      firmware().silent = false;
      await session.close();
    });

    it.each([
      ['not base64', { value: 'not base64!' }],
      ['not a string', { value: 7 }],
      ['missing', {}],
    ])('fails a read whose value is %s with INTERNAL malformed-result', async (_name, result) => {
      const session = await ble.openSession((await endpoint()).id);
      firmware().silent = true;
      const reading = capture(session.read('info'));
      await flush();
      spec.answer(sent(AttractapEventType.BLE_READ)[0], { ok: true, ...result });
      await expect(reading).resolves.toMatchObject({
        ok: false,
        error: { code: 'INTERNAL', detail: 'malformed-result' },
      });
      firmware().silent = false;
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });
  });

  describe('bounds', () => {
    it('length-checks base64 before decoding and tells malformed from oversized', () => {
      expect(decodeBleBytes('AQID', 3)).toEqual(Uint8Array.of(1, 2, 3));
      expect(decodeBleBytes('AQIDBA==', 3)).toBeNull();
      expect(decodeBleBytes('A'.repeat(1_000_000), 512)).toBeNull();
      expect(decodeBleBytes('AQI', 3)).toBeNull();
      expect(decodeBleBytes(42, 3)).toBeNull();
      expect(readBleBytes('', 3)).toEqual({ bytes: new Uint8Array(0) });
      expect(readBleBytes('AQIDBA==', 3)).toEqual({ error: 'oversized' });
      expect(readBleBytes('AQIDBA==', 4)).toEqual({ bytes: Uint8Array.of(1, 2, 3, 4) });
      expect(readBleBytes('AAAAAA==', 3)).toEqual({ error: 'oversized' });
      expect(readBleBytes('A'.repeat(1_000_000), 512)).toEqual({ error: 'oversized' });
      expect(readBleBytes('AQI', 3)).toEqual({ error: 'malformed' });
      expect(readBleBytes('AQ!D', 3)).toEqual({ error: 'malformed' });
      expect(readBleBytes(42, 3)).toEqual({ error: 'malformed' });
      expect(readBleBytes(undefined, 3)).toEqual({ error: 'malformed' });
    });

    it('caps the requests waiting for one reader connection at what the reader announced', async () => {
      const cap = FAKE_READER_BLE_CAPABILITY.maxPendingRequests;
      const session = await ble.openSession((await endpoint()).id);
      firmware().silent = true;
      const channel = spec.channel();
      const results: Array<Promise<unknown>> = [];
      for (let i = channel.pendingCount; i < cap; i++) {
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
    type Step = 'close' | 'ended' | 'socket';
    /** What the first cause decides: the pending call's error and the close reason. */
    const decidedBy: Record<Step, { error: Record<string, string>; reason: string; closesSent: number }> = {
      close: { error: { code: 'SESSION_CLOSED' }, reason: 'closed', closesSent: 1 },
      ended: { error: { code: 'DISCONNECTED' }, reason: 'disconnected', closesSent: 0 },
      socket: { error: { code: 'DISCONNECTED', detail: 'reader-link-lost' }, reason: 'disconnected', closesSent: 0 },
    };

    const orders: Step[][] = [
      ['close', 'ended', 'socket'],
      ['close', 'socket', 'ended'],
      ['ended', 'close', 'socket'],
      ['ended', 'socket', 'close'],
      ['socket', 'close', 'ended'],
      ['socket', 'ended', 'close'],
      ['close', 'ended'],
      ['close', 'socket'],
      ['ended', 'socket'],
      ['socket', 'ended'],
      ['close'],
      ['ended'],
      ['socket'],
    ];

    it.each(orders.map((order) => [order.join(' > '), order] as const))(
      'is idempotent, and the first cause decides the outcome: %s',
      async (_name, order) => {
        const { metrics } = spec.withMetrics();
        const decrements = jest.spyOn(metrics.sessionsActive, 'dec');
        const closes = jest.spyOn(metrics.sessionCloses, 'inc');
        const session = await ble.openSession((await endpoint()).id);
        const pending = capture(session.read('slow'));
        await flush();
        const target = socket();
        const firmwares = new Set([firmware()]);
        for (const step of order) {
          if (step === 'close') void session.close();
          if (step === 'ended') {
            // The peripheral drops: the reader reports the end; a duplicate on the old socket changes nothing.
            await harness.disconnect(ADDRESS);
            fromReader(target, AttractapEventType.BLE_SESSION_ENDED, { v: 1, sessionId: session.id, reason: 'gone' });
          }
          if (step === 'socket') harness.reconnectReader(1);
          firmwares.add(firmware());
          // Never past an operation deadline: every cause settles on its own.
          await flush();
        }
        const expected = decidedBy[order[0]];
        await expect(pending).resolves.toMatchObject({ ok: false, error: expected.error });
        await expect(session.closed).resolves.toEqual({ reason: expected.reason });
        const closeRequests = [...firmwares].flatMap((candidate) =>
          candidate.received.filter(
            (message) =>
              message.type === AttractapEventType.BLE_SESSION_CLOSE && message.payload.sessionId === session.id,
          ),
        );
        expect(closeRequests).toHaveLength(expected.closesSent);
        expect(harness.openSessions()).toEqual([]);
        expect(harness.driver.liveLinks).toBe(0);
        expect(decrements).toHaveBeenCalledTimes(1);
        expect(closes).toHaveBeenCalledTimes(1);
        expect(closes).toHaveBeenCalledWith({ reason: expected.reason });
      },
    );
  });

  describe('metrics', () => {
    it('counts notifications by outcome without reader or session labels', async () => {
      const { registry } = spec.withMetrics();
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

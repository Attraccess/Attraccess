import type { PluginBleSession } from '@attraccess/plugins-backend-sdk';
import { AttractapEventType } from '../../websocket.types';
import { ADDRESS, capture, useReaderBleSpec } from './__test__/reader-ble-spec.test-fixture';

describe('ReaderBleLink (one session on the reader)', () => {
  const spec = useReaderBleSpec();
  const { socket, sent, fromReader, endpoint, flush } = spec;
  const firmware = () => spec.firmware();

  const open = async (): Promise<PluginBleSession> => spec.ble.openSession((await endpoint()).id);
  const notify = (session: PluginBleSession, subscriptionId: unknown, payload: Record<string, unknown>) =>
    fromReader(socket(), AttractapEventType.BLE_NOTIFICATION, {
      v: 1,
      sessionId: session.id,
      subscriptionId,
      ...payload,
    });
  /** A write without response the reader fails after the API already resolved it. */
  const failPipelinedWrite = async (session: PluginBleSession) => {
    firmware().silent = true;
    await session.write('bulk', Uint8Array.of(1), { withoutResponse: true });
    const write = spec.present(sent(AttractapEventType.BLE_WRITE).at(-1));
    spec.answer(write, { ok: false, error: { code: 'GATT_ERROR', detail: 'att:0x0e' } });
    await flush();
    firmware().silent = false;
  };

  describe('a failed write without response', () => {
    it('is reported by the next read, which is not sent', async () => {
      const session = await open();
      await failPipelinedWrite(session);
      await expect(session.read('info')).rejects.toMatchObject({ code: 'GATT_ERROR', detail: 'att:0x0e' });
      expect(sent(AttractapEventType.BLE_READ)).toEqual([]);
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('survives a failed stream being torn down, and its unsubscribe still reaches the reader', async () => {
      const session = await open();
      const stream = await session.subscribe('events');
      const subscriptionId = sent(AttractapEventType.BLE_SUBSCRIBE)[0].payload.requestId;
      await failPipelinedWrite(session);
      // A gap fails the stream: the engine unsubscribes outside the plugin's operations.
      notify(session, subscriptionId, { seq: 2, value: 'AQ==' });
      await expect(stream.next()).rejects.toMatchObject({ code: 'INTERNAL', detail: 'malformed-notification' });
      await flush();
      expect(sent(AttractapEventType.BLE_UNSUBSCRIBE)).toHaveLength(1);
      await expect(session.read('info')).rejects.toMatchObject({ code: 'GATT_ERROR', detail: 'att:0x0e' });
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
    });

    it('is logged at close when no call came after it', async () => {
      const logs = spec.driverLogs();
      const session = await open();
      await failPipelinedWrite(session);
      await session.close();
      expect(logs).toContainEqual(
        expect.stringMatching(
          /^ble pipelined write failed before close reader=1 .* outcome=GATT_ERROR detail=att:0x0e$/,
        ),
      );
    });
  });

  describe('characteristics are keyed by service and characteristic', () => {
    // The same characteristic UUIDs in two services, with different bounds.
    const TWIN = {
      id: 'twin',
      services: [
        {
          uuid: 'fff0',
          characteristics: [
            { key: 'wide', uuid: 'aaa1', operations: ['read' as const], maxReadBytes: 8 },
            { key: 'wideEvents', uuid: 'aaa2', operations: ['notify' as const], maxNotificationBytes: 8 },
          ],
        },
        {
          uuid: 'fee0',
          characteristics: [
            { key: 'narrow', uuid: 'aaa1', operations: ['read' as const], maxReadBytes: 2 },
            { key: 'narrowEvents', uuid: 'aaa2', operations: ['notify' as const], maxNotificationBytes: 8 },
          ],
        },
      ],
    };
    let session: PluginBleSession;

    beforeEach(async () => {
      spec.harness.addPeripheral({
        readerId: 1,
        address: 'AA:BB:CC:DD:EE:07',
        addressType: 'public',
        advertisement: {},
        characteristics: { aaa1: { value: Uint8Array.of(1, 2, 3, 4, 5) }, aaa2: {} },
      });
      spec.ble.registerProfile(TWIN);
      const created = await spec.ble.createEndpoint({
        readerId: 1,
        address: 'AA:BB:CC:DD:EE:07',
        addressType: 'public',
        profileId: TWIN.id,
      });
      session = await spec.ble.openSession(created.id);
    });

    afterEach(() => session.close());

    it('applies the read bound of the characteristic in the service that was read', async () => {
      await expect(session.read('wide')).resolves.toEqual(Uint8Array.of(1, 2, 3, 4, 5));
      await expect(session.read('narrow')).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE', detail: 'max-read' });
    });

    it('unsubscribes one service without ending the other one', async () => {
      const wide = await session.subscribe('wideEvents');
      const narrow = await session.subscribe('narrowEvents');
      const [, narrowSubscribe] = sent(AttractapEventType.BLE_SUBSCRIBE);
      await wide.unsubscribe();
      expect(sent(AttractapEventType.BLE_UNSUBSCRIBE)).toHaveLength(1);
      notify(session, narrowSubscribe.payload.requestId, { seq: 1, value: 'CQ==' });
      const next = capture(narrow.next({ timeoutMs: 1_000 }));
      await spec.harness.advance(1_000);
      await expect(next).resolves.toMatchObject({ ok: true, value: { value: Uint8Array.of(9) } });
    });
  });

  describe('metrics and logs', () => {
    it('counts an oversized read result as one rejection', async () => {
      const { registry } = spec.withMetrics();
      const session = await open();
      firmware().silent = true;
      const reading = capture(session.read('slow'));
      await flush();
      spec.answer(sent(AttractapEventType.BLE_READ)[0], { ok: true, value: 'AQIDBAU=' });
      await expect(reading).resolves.toMatchObject({
        ok: false,
        error: { code: 'PAYLOAD_TOO_LARGE', detail: 'max-read' },
      });
      const text = await registry.metrics();
      expect(text).toContain('attraccess_plugin_ble_rejections_total{code="PAYLOAD_TOO_LARGE"} 1');
      expect(text).toContain('attraccess_plugin_ble_operations_total{operation="read",outcome="PAYLOAD_TOO_LARGE"} 1');
      firmware().silent = false;
      await session.close();
    });

    it('counts and logs a stream that overflowed its queue on the API side', async () => {
      const { registry } = spec.withMetrics();
      const logs = spec.serviceLogs();
      const session = await open();
      const stream = await session.subscribe('events');
      // The plugin does not read: the fifth notification overflows the profile's queue of four.
      for (let i = 0; i < 5; i++) spec.harness.notify(ADDRESS, 'fff2', Uint8Array.of(i));
      await expect(stream.next()).rejects.toMatchObject({ code: 'NOTIFICATION_OVERFLOW' });
      const text = await registry.metrics();
      expect(text).toContain('attraccess_plugin_ble_notifications_total{outcome="overflow"} 1');
      expect(logs).toContainEqual(
        expect.stringMatching(
          new RegExp(
            `^ble notification stream failed reader=1 endpoint=\\S+ plugin=plugin-a profile=demo session=${session.id} ` +
              'outcome=overflow code=NOTIFICATION_OVERFLOW detail=capacity 4$',
          ),
        ),
      );
      await flush();
      expect(sent(AttractapEventType.BLE_UNSUBSCRIBE)).toHaveLength(1);
      await session.close();
    });

    it('logs the safe detail of a failed operation', async () => {
      const logs = spec.serviceLogs();
      const session = await open();
      spec.harness.driver.failNext('read', 'GATT_ERROR', 'att:0x0a');
      await expect(session.read('info')).rejects.toMatchObject({ code: 'GATT_ERROR', detail: 'att:0x0a' });
      expect(logs).toContainEqual(
        expect.stringMatching(/^ble op=read reader=1 .* session=\S+ outcome=GATT_ERROR detail=att:0x0a \d+ms$/),
      );
      await session.close();
    });

    it('logs a stream the reader failed with its outcome, code and detail', async () => {
      const logs = spec.driverLogs();
      const session = await open();
      const stream = await session.subscribe('events');
      spec.harness.notify(ADDRESS, 'fff2', new Uint8Array(9));
      await expect(stream.next()).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE', detail: 'max-notification' });
      expect(logs).toContainEqual(
        expect.stringMatching(
          /^ble notification stream failed reader=1 .* outcome=oversized code=PAYLOAD_TOO_LARGE detail=max-notification$/,
        ),
      );
      await session.close();
    });

    it('logs only integers of what an unknown or stale reader message carried', async () => {
      const logs = spec.driverLogs();
      const session = await open();
      fromReader(socket(), AttractapEventType.BLE_RESULT, { v: 'x\nINJECTED', sessionId: session.id, requestId: 1 });
      fromReader(socket(), AttractapEventType.BLE_RESULT, { v: 7, sessionId: session.id, requestId: 1 });
      fromReader(socket(), AttractapEventType.BLE_RESULT, { v: 1, sessionId: session.id, requestId: 'x\nINJECTED' });
      fromReader(socket(), AttractapEventType.BLE_RESULT, { v: 1, sessionId: session.id, requestId: 999 });
      expect(logs).toEqual(
        expect.arrayContaining([
          'ble ignored message type=BLE_RESULT reader=1 v=invalid: unsupported protocol version',
          'ble ignored message type=BLE_RESULT reader=1 v=7: unsupported protocol version',
          'ble dropped result reader=1 request=invalid: unknown or stale',
          'ble dropped result reader=1 request=999: unknown or stale',
        ]),
      );
      expect(logs.join('\n')).not.toContain('INJECTED');
      await session.close();
    });
  });
});

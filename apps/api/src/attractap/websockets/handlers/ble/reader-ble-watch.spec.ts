import type { PluginBleContext, PluginBleWatchEvent } from '@attraccess/plugins-backend-sdk';
import { AttractapEventType } from '../../websocket.types';
import { parseBleCapability } from './ble-wire';
import { BLE_WATCH_RATE_SLACK } from './reader-ble-watch';
import {
  FAKE_READER_BLE_CAPABILITY,
  FAKE_READER_BLE_CAPABILITY_WITHOUT_WATCH,
} from './__test__/fake-ble-reader.test-fixture';
import { ADDRESS, PROFILE, SERVICE, useReaderBleSpec } from './__test__/reader-ble-spec.test-fixture';

/** `context.ble.watch`, which every host of this version has. */
const watchOf = (ctx: PluginBleContext) => {
  if (!ctx.watch) throw new Error('this host has no advertisement watch');
  return ctx.watch.bind(ctx);
};

const FFF0 = '0000fff0-0000-1000-8000-00805f9b34fb';
const wireEvent = (overrides: Record<string, unknown> = {}) => ({
  filters: [1],
  address: ADDRESS,
  addressType: 'public',
  rssi: -61,
  name: 'Demo',
  serviceUuids: [FFF0],
  manufacturerData: [{ companyId: 65535, data: 'AQI=' }],
  changed: true,
  ...overrides,
});

describe('ReaderBleDriver advertisement watch (BLE_WATCH_* over the reader websocket)', () => {
  const spec = useReaderBleSpec();
  const { sent, socket, firmware, fromReader, flush, driver } = spec;

  const watch = async (options = {}, ctx = spec.ble, profileId = PROFILE.id) => {
    const events: PluginBleWatchEvent[] = [];
    const handle = await watchOf(ctx)(profileId, (event) => void events.push(event), options);
    await flush();
    return { handle, events };
  };
  const events = async (list: unknown[], target = socket()) => {
    fromReader(target, AttractapEventType.BLE_WATCH_EVENT, { v: 1, events: list });
    await flush();
  };

  describe('BLE_WATCH_SET', () => {
    it('sends the whole set with v, requestId, filters and keepaliveMs, without a session', async () => {
      await watch();
      expect(sent(AttractapEventType.BLE_WATCH_SET)).toEqual([
        {
          type: AttractapEventType.BLE_WATCH_SET,
          payload: {
            v: 1,
            requestId: expect.any(Number),
            filters: [{ id: 1, manufacturerIds: [], serviceUuids: [FFF0] }],
            keepaliveMs: 30_000,
          },
        },
      ]);
      expect(spec.channel).toThrow();
    });

    it('sends an empty set when the last watch closes', async () => {
      const { handle } = await watch();
      await handle.close();
      expect(sent(AttractapEventType.BLE_WATCH_SET).at(-1)?.payload).toMatchObject({ filters: [] });
      expect(firmware().watchFilters).toEqual([]);
    });

    it('coexists with a session: the watch takes no BLE owner, and a session opens beside it', async () => {
      const created = await spec.endpoint();
      const session = await spec.ble.openSession(created.id);
      const { handle, events: received } = await watch();
      expect(handle.readers()).toEqual([{ readerId: 1, status: 'watching' }]);
      firmware().advertise({ address: ADDRESS, addressType: 'public', serviceUuids: [FFF0], manufacturerData: [] });
      await flush();
      expect(received).toHaveLength(1);
      await expect(session.read('info')).resolves.toEqual(Uint8Array.of(1, 2, 3));
      await session.close();
      await expect(spec.ble.scan(1, PROFILE.id)).resolves.toHaveLength(2);
    });

    it('reports firmware without a watch as unsupported and sends nothing', async () => {
      socket().state.ble = parseBleCapability(FAKE_READER_BLE_CAPABILITY_WITHOUT_WATCH);
      const { handle } = await watch();
      expect(handle.readers()).toEqual([{ readerId: 1, status: 'unsupported', detail: 'no-watch-capability' }]);
      expect(sent(AttractapEventType.BLE_WATCH_SET)).toEqual([]);
    });

    it.each([
      [{ version: 2 }, 'watch-version:2'],
      ['yes', 'no-watch-capability'],
    ])('reports watch capability %j as unsupported (%s)', async (capability, detail) => {
      socket().state.ble = parseBleCapability({ ...FAKE_READER_BLE_CAPABILITY, watch: capability });
      const { handle } = await watch();
      expect(handle.readers()[0]).toEqual({ readerId: 1, status: 'unsupported', detail });
    });

    it('clamps the announced capability', () => {
      const parsed = parseBleCapability({
        ...FAKE_READER_BLE_CAPABILITY,
        watch: { version: 1, maxFilters: 99, maxDevices: 0, maxEventsPerSecond: 'x' },
      });
      expect(parsed).toMatchObject({
        capability: {
          watch: { supported: true, capability: { maxFilters: 16, maxDevices: 1, maxEventsPerSecond: 20 } },
        },
      });
    });

    it('keeps filters beyond the reader capacity off the reader and reports them', async () => {
      socket().state.ble = parseBleCapability({
        ...FAKE_READER_BLE_CAPABILITY,
        watch: { ...FAKE_READER_BLE_CAPABILITY.watch, maxFilters: 1 },
      });
      spec.other.registerProfile({ ...PROFILE, id: 'named', advertisement: { namePrefix: 'Dev' } });
      spec.ble.registerProfile({
        ...PROFILE,
        id: 'wide',
        advertisement: { serviceUuids: ['a001', 'a002', 'a003', 'a004', 'a005', 'a006', 'a007', 'a008', 'a009'] },
      });
      const first = await watch();
      const second = await watch({}, spec.other, 'named');
      const wide = await watch({}, spec.ble, 'wide');
      expect(firmware().watchFilters.map((filter) => filter.id)).toEqual([1]);
      expect(first.handle.readers()[0].status).toBe('watching');
      expect(second.handle.readers()[0]).toEqual({ readerId: 1, status: 'unsupported', detail: 'too-many-filters' });
      expect(wide.handle.readers()[0]).toEqual({ readerId: 1, status: 'unsupported', detail: 'filter-too-large' });
    });

    it('reports a set the reader refused as unsupported with its detail', async () => {
      firmware().watchError = { code: 'INVALID_ARGUMENT', detail: 'too-many-filters' };
      const { handle } = await watch();
      expect(handle.readers()[0]).toEqual({ readerId: 1, status: 'unsupported', detail: 'too-many-filters' });
    });

    it('logs unsolicited state changes of the reader and ignores stale answers', async () => {
      const logs = spec.driverLogs();
      const { handle } = await watch();
      fromReader(socket(), AttractapEventType.BLE_WATCH_STATE, { v: 1, active: false, detail: 'radio-busy' });
      fromReader(socket(), AttractapEventType.BLE_WATCH_STATE, { v: 1, requestId: 9999, ok: false, error: {} });
      expect(logs).toContainEqual(expect.stringContaining('active=false detail=radio-busy'));
      expect(handle.readers()[0].status).toBe('watching');
    });
  });

  describe('connections', () => {
    it('reports offline when the reader drops and sends the set again after it announced itself', async () => {
      const { handle } = await watch();
      spec.harness.setReaderAvailable(1, false);
      await flush();
      expect(handle.readers()[0]).toEqual({ readerId: 1, status: 'offline' });
      spec.harness.setReaderAvailable(1, true);
      await flush();
      expect(handle.readers()[0]).toEqual({ readerId: 1, status: 'watching' });
      expect(sent(AttractapEventType.BLE_WATCH_SET)).toHaveLength(1);
      expect(firmware().watchFilters).toHaveLength(1);
    });

    it('accepts events only from the connection the set went to', async () => {
      const { events: received } = await watch();
      const old = socket();
      // A reset reader is back on a new connection while the old one is still half open.
      spec.harness.reconnectReader(1, { halfOpen: true });
      expect(firmware().watchFilters).toHaveLength(1);
      await events([wireEvent()], old);
      expect(received).toHaveLength(0);
      await events([wireEvent()]);
      expect(received).toHaveLength(1);
      // The old connection closing late does not take the reader offline.
      driver().socketClosed(old);
      await events([wireEvent({ name: 'Demo 2' })]);
      expect(received).toHaveLength(2);
    });
  });

  describe('BLE_WATCH_EVENT', () => {
    it('decodes events like scan results, with the receive time', async () => {
      const { events: received } = await watch();
      await events([wireEvent(), wireEvent({ changed: false, rssi: -70 })]);
      expect(received).toEqual([
        expect.objectContaining({
          readerId: 1,
          address: ADDRESS,
          rssi: -61,
          name: 'Demo',
          serviceUuids: [FFF0],
          manufacturerData: [{ companyId: 65535, data: Uint8Array.of(1, 2) }],
          changed: true,
          receivedAt: new Date(spec.harness.clock.now()),
        }),
        expect.objectContaining({ changed: false, rssi: -70 }),
      ]);
    });

    it('drops malformed entries, unknown filters and more than 8 events per message', async () => {
      const { registry } = spec.withMetrics();
      const { events: received } = await watch();
      await events([
        wireEvent({ address: 'not-an-address' }),
        wireEvent({ changed: 'yes' }),
        wireEvent({ filters: ['1'] }),
        wireEvent({ filters: 1 }),
        wireEvent({ filters: [42] }),
        wireEvent({ manufacturerData: [{ companyId: 1, data: 'A'.repeat(200) }], serviceUuids: [FFF0] }),
      ]);
      expect(received).toHaveLength(1);
      await events(Array.from({ length: 11 }, () => wireEvent()));
      expect(received).toHaveLength(9);
      fromReader(socket(), AttractapEventType.BLE_WATCH_EVENT, { v: 1, events: 'nope' });
      const dropped = (await registry.getSingleMetric('attraccess_plugin_ble_watch_events_dropped_total')?.get())
        ?.values;
      const count = (reason: string) => dropped?.find((value) => value.labels.reason === reason)?.value;
      expect([count('malformed'), count('no-watch'), count('batch-too-large')]).toEqual([5, 1, 3]);
    });

    it('drops events beyond the announced rate', async () => {
      const { events: received } = await watch();
      const budget = FAKE_READER_BLE_CAPABILITY.watch.maxEventsPerSecond * BLE_WATCH_RATE_SLACK;
      for (let sent = 0; sent < budget + 8; sent += 8) await events(Array.from({ length: 8 }, () => wireEvent()));
      expect(received).toHaveLength(budget);
      await spec.harness.advance(1_000);
      await events([wireEvent()]);
      expect(received).toHaveLength(budget + 1);
    });

    it('drops events of a reader without a watch and of an unknown version', async () => {
      await events([wireEvent()]);
      const { events: received } = await watch();
      fromReader(socket(), AttractapEventType.BLE_WATCH_EVENT, { v: 2, events: [wireEvent()] });
      await flush();
      expect(received).toEqual([]);
    });

    it('routes a device the reader matched loosely only after the profile check', async () => {
      const { events: received } = await watch();
      await events([wireEvent({ serviceUuids: [SERVICE.padStart(8, '0') + '-0000-1000-8000-00805f9b34fc'] })]);
      expect(received).toEqual([]);
    });
  });
});

import type { FakeBleHost, FakeBleWatchAdvertisement } from './plugin-ble-fake';
import {
  PLUGIN_BLE_WATCH_LIMITS,
  type PluginBleContext,
  type PluginBleWatch,
  type PluginBleWatchEvent,
  type PluginBleWatchOptions,
  type PluginBleWatchReaderState,
} from './plugin-ble';
import {
  ADDRESS,
  bytes,
  capture,
  NORMALIZED,
  PROFILE,
  seedBleContract,
  SERVICE,
  type BleContractFactory,
  type BleContractSubject,
} from './plugin-ble-contract.test-cases';

/** A device that matches `PROFILE` (service `fff0` and a name starting with `Demo`). */
const DEMO: FakeBleWatchAdvertisement = {
  address: ADDRESS,
  addressType: 'public',
  rssi: -60,
  name: 'Demo 1',
  serviceUuids: [SERVICE],
  manufacturerData: [{ companyId: 0xffff, data: bytes(1, 2) }],
};

const FFF0 = '0000fff0-0000-1000-8000-00805f9b34fb';

/**
 * Third part of the shared contract suite: the advertisement watch. Readers report what a test advertises; the
 * fake applies the profile filter itself, the host gets it from the reader (or the test driver) by filter id.
 */
export function defineBleContractWatchSuite(name: string, create: BleContractFactory): void {
  describe(`plugin BLE contract (advertisement watch): ${name}`, () => {
    let subject: BleContractSubject;
    let host: FakeBleHost;
    let a: PluginBleContext;
    let b: PluginBleContext;

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

    const settle = () => host.advance(0);
    const watchOf = (ctx: PluginBleContext) => {
      if (!ctx.watch) throw new Error('this host has no advertisement watch');
      return ctx.watch.bind(ctx);
    };
    /** A watch on `ctx` that records its events and status changes. */
    const record = async (ctx = a, options: PluginBleWatchOptions = {}, profileId = PROFILE.id) => {
      const events: PluginBleWatchEvent[] = [];
      const statuses: PluginBleWatchReaderState[] = [];
      const watch = await watchOf(ctx)(profileId, (event) => void events.push(event), {
        ...options,
        onReaderStatus: (state) => void statuses.push(state),
      });
      await settle();
      return { watch, events, statuses };
    };

    describe('arguments and limits', () => {
      it('rejects unknown profiles, profiles without a filter and malformed arguments', async () => {
        const watch = watchOf(a);
        const handler = () => undefined;
        a.registerProfile({ ...PROFILE, id: 'quiet', advertisement: undefined });
        await expect(watch('missing', handler)).rejects.toMatchObject({ code: 'PROFILE_NOT_REGISTERED' });
        await expect(watch('quiet', handler)).rejects.toMatchObject({ code: 'INVALID_PROFILE' });
        await expect(watch(PROFILE.id, 'nope' as never)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        await expect(watch(PROFILE.id, handler, { readerIds: [0] })).rejects.toMatchObject({
          code: 'INVALID_ARGUMENT',
          detail: 'readerIds[0]',
        });
        await expect(watch(PROFILE.id, handler, { readerIds: 1 as never })).rejects.toMatchObject({
          code: 'INVALID_ARGUMENT',
        });
        // Another plugin's profile is as unknown as a missing one.
        await expect(watchOf(b)(PROFILE.id, handler)).rejects.toMatchObject({ code: 'PROFILE_NOT_REGISTERED' });
        const controller = new AbortController();
        controller.abort();
        await expect(watch(PROFILE.id, handler, { signal: controller.signal })).rejects.toMatchObject({
          code: 'CANCELLED',
        });
        expect(host.openWatches()).toEqual([]);
      });

      it('caps the watches per plugin with a retryable READER_BUSY watch-limit', async () => {
        const watches: PluginBleWatch[] = [];
        for (let index = 0; index < PLUGIN_BLE_WATCH_LIMITS.maxWatchesPerPlugin; index++) {
          watches.push(await watchOf(a)(PROFILE.id, () => undefined));
        }
        await expect(watchOf(a)(PROFILE.id, () => undefined)).rejects.toMatchObject({
          code: 'READER_BUSY',
          detail: 'watch-limit',
          retryable: true,
        });
        // The cap is per plugin.
        b.registerProfile(PROFILE);
        await (await watchOf(b)(PROFILE.id, () => undefined)).close();
        await watches[0].close();
        await (await watchOf(a)(PROFILE.id, () => undefined)).close();
      });

      it('hands out a frozen watch handle', async () => {
        const watch = await watchOf(a)(PROFILE.id, () => undefined);
        expect(Object.keys(watch).sort()).toEqual(['close', 'closed', 'id', 'profileId', 'readers']);
        expect(Object.isFrozen(watch)).toBe(true);
        expect(watch.profileId).toBe(PROFILE.id);
        expect(host.openWatches()).toEqual([{ id: watch.id, pluginId: 'plugin-a', profileId: PROFILE.id }]);
      });
    });

    describe('readers', () => {
      it('watches every reader open for plugins, and readers opened later', async () => {
        const { watch, statuses } = await record();
        expect(watch.readers()).toEqual([
          { readerId: 1, status: 'watching' },
          { readerId: 2, status: 'watching' },
        ]);
        expect(statuses).toEqual(watch.readers());
        await host.setReaderAccess(3, true);
        await settle();
        expect(watch.readers()).toContainEqual({ readerId: 3, status: 'watching' });
        expect(statuses.at(-1)).toEqual({ readerId: 3, status: 'watching' });
      });

      it('reports listed readers that are closed as access-denied until an administrator opens them', async () => {
        const { watch, statuses, events } = await record(a, { readerIds: [1, 3] });
        expect(watch.readers()).toEqual([
          { readerId: 1, status: 'watching' },
          { readerId: 3, status: 'access-denied' },
        ]);
        await host.advertise(3, DEMO);
        expect(events).toEqual([]);
        await host.setReaderAccess(3, true);
        await settle();
        expect(watch.readers()).toContainEqual({ readerId: 3, status: 'watching' });
        await host.setReaderAccess(1, false);
        await settle();
        expect(watch.readers()).toContainEqual({ readerId: 1, status: 'access-denied' });
        expect(statuses.slice(2)).toEqual([
          { readerId: 3, status: 'watching' },
          { readerId: 1, status: 'access-denied' },
        ]);
        await host.advertise(1, DEMO);
        expect(events).toEqual([]);
      });

      it('reports offline readers and resumes when they are back', async () => {
        const { watch, events } = await record();
        host.setReaderAvailable(1, false);
        await settle();
        expect(watch.readers()[0]).toEqual({ readerId: 1, status: 'offline' });
        await host.advertise(1, DEMO);
        expect(events).toEqual([]);
        host.setReaderAvailable(1, true);
        await settle();
        expect(watch.readers()[0]).toEqual({ readerId: 1, status: 'watching' });
        await host.advertise(1, DEMO);
        expect(events).toHaveLength(1);
      });

      it('reports readers whose firmware cannot watch as unsupported, with a detail', async () => {
        const { watch } = await record();
        host.setReaderWatchSupported(1, false);
        host.setReaderSupported(2, false);
        await settle();
        expect(watch.readers()).toEqual([
          { readerId: 1, status: 'unsupported', detail: 'no-watch-capability' },
          { readerId: 2, status: 'unsupported', detail: 'no-ble-capability' },
        ]);
        host.setReaderWatchSupported(1, true);
        await settle();
        expect(watch.readers()[0]).toEqual({ readerId: 1, status: 'watching' });
      });

      it('reports every reader as unsupported without a transport', async () => {
        host.setTransportAvailable(false);
        const { watch } = await record();
        expect(watch.readers()).toEqual([
          { readerId: 1, status: 'unsupported', detail: 'no-transport' },
          { readerId: 2, status: 'unsupported', detail: 'no-transport' },
        ]);
      });
    });

    describe('events', () => {
      it('delivers matching advertisements, normalized, with changed and keepalive', async () => {
        const { events } = await record();
        await host.advertise(1, DEMO);
        await host.advertise(1, { ...DEMO, rssi: -70 });
        await host.advertise(1, { ...DEMO, manufacturerData: [{ companyId: 0xffff, data: bytes(1, 3) }] });
        await host.advertise(2, DEMO, { changed: false });
        expect(events.map((event) => [event.readerId, event.changed, event.rssi])).toEqual([
          [1, true, -60],
          [1, false, -70],
          [1, true, -60],
          [2, false, -60],
        ]);
        expect(events[0]).toMatchObject({
          address: NORMALIZED,
          addressType: 'public',
          name: 'Demo 1',
          serviceUuids: [FFF0],
          manufacturerData: [{ companyId: 0xffff, data: bytes(1, 2) }],
        });
        expect(events[0].receivedAt).toBeInstanceOf(Date);
      });

      it('applies the full profile filter, not only part of it', async () => {
        const { events } = await record();
        // The service matches, the name prefix does not; then the other way round; then neither.
        await host.advertise(1, { ...DEMO, name: 'Other' });
        await host.advertise(1, { ...DEMO, serviceUuids: ['180f'] });
        await host.advertise(1, { address: '11:22:33:44:55:66', addressType: 'random', name: 'Thing' });
        expect(events).toEqual([]);
      });

      it('delivers only on the readers of the watch', async () => {
        const { events } = await record(a, { readerIds: [2] });
        await host.advertise(1, DEMO);
        await host.advertise(2, DEMO);
        expect(events.map((event) => event.readerId)).toEqual([2]);
      });

      it('routes events to the plugins whose own profile matches, each with its own copy', async () => {
        b.registerProfile(PROFILE);
        b.registerProfile({ ...PROFILE, id: 'battery', advertisement: { serviceUuids: ['180f'] } });
        const first = await record(a);
        const second = await record(b);
        const battery = await record(b, {}, 'battery');
        await host.advertise(1, DEMO);
        await host.advertise(1, { address: '11:22:33:44:55:66', addressType: 'random', serviceUuids: ['180f'] });
        expect(first.events.map((event) => event.address)).toEqual([NORMALIZED]);
        expect(second.events.map((event) => event.address)).toEqual([NORMALIZED]);
        expect(battery.events.map((event) => event.address)).toEqual(['11:22:33:44:55:66']);
        first.events[0].manufacturerData[0].data[0] = 99;
        expect(second.events[0].manufacturerData[0].data[0]).toBe(1);
      });

      it('runs the handler serially, in order, and keeps going after it throws', async () => {
        const seen: string[] = [];
        let running = 0;
        let maxRunning = 0;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        await watchOf(a)(PROFILE.id, async (event) => {
          maxRunning = Math.max(maxRunning, ++running);
          seen.push(event.name ?? '');
          if (seen.length === 1) await gate;
          running--;
          if (seen.length === 2) throw new Error('plugin bug');
        });
        for (const label of ['Demo a', 'Demo b', 'Demo c']) await host.advertise(1, { ...DEMO, name: label });
        expect(seen).toEqual(['Demo a']);
        release();
        await settle();
        expect(seen).toEqual(['Demo a', 'Demo b', 'Demo c']);
        expect(maxRunning).toBe(1);
      });

      it('drops the oldest queued events while the handler is busy', async () => {
        const seen: number[] = [];
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        await watchOf(a)(PROFILE.id, async (event) => {
          seen.push(event.manufacturerData[0].data[0]);
          if (seen.length === 1) await gate;
        });
        const total = PLUGIN_BLE_WATCH_LIMITS.maxQueuedEvents + 3;
        for (let index = 0; index < total; index++) {
          await host.advertise(1, { ...DEMO, manufacturerData: [{ companyId: 0xffff, data: bytes(index) }] });
          // Within the event rate a reader announces (20 per second).
          await host.advance(100);
        }
        release();
        await settle();
        // The first is in the handler, events 1 and 2 were dropped, the newest 64 follow.
        expect(seen).toHaveLength(1 + PLUGIN_BLE_WATCH_LIMITS.maxQueuedEvents);
        expect(seen.slice(0, 3)).toEqual([0, 3, 4]);
        expect(seen.at(-1)).toBe(total - 1);
      });

      it('watches alongside sessions and scans on the same reader', async () => {
        const { events } = await record();
        const created = await a.createEndpoint({
          readerId: 1,
          address: ADDRESS,
          addressType: 'public',
          profileId: PROFILE.id,
        });
        const session = await a.openSession(created.id);
        await host.advertise(1, DEMO);
        await session.close();
        await expect(capture(a.scan(1, PROFILE.id))).resolves.toMatchObject({ ok: true });
        await host.advertise(1, { ...DEMO, name: 'Demo 2' });
        expect(events).toHaveLength(2);
      });
    });

    describe('closing', () => {
      it('closes idempotently, stops delivery and frees the slot', async () => {
        const { watch, events } = await record();
        await watch.close();
        await watch.close();
        await expect(watch.closed).resolves.toEqual({ reason: 'closed' });
        await host.advertise(1, DEMO);
        expect(events).toEqual([]);
        expect(host.openWatches()).toEqual([]);
      });

      it('closes with "cancelled" when its signal aborts', async () => {
        const controller = new AbortController();
        const { watch } = await record(a, { signal: controller.signal });
        controller.abort();
        await expect(watch.closed).resolves.toEqual({ reason: 'cancelled' });
      });

      it('closes the plugin’s watches with "shutdown" on unload and uninstall, and no other plugin’s', async () => {
        b.registerProfile(PROFILE);
        const own = await record(a);
        const other = await record(b);
        await host.shutdownPlugin('plugin-a');
        await expect(own.watch.closed).resolves.toEqual({ reason: 'shutdown' });
        await host.advertise(1, DEMO);
        expect(own.events).toEqual([]);
        expect(other.events).toHaveLength(1);
        await host.uninstallPlugin('plugin-b');
        await expect(other.watch.closed).resolves.toEqual({ reason: 'shutdown' });
        expect(host.openWatches()).toEqual([]);
      });
    });

    it('rejects with a retryable NOT_READY before bootstrap and never throws synchronously', async () => {
      await subject.dispose();
      subject = await create({ ready: false });
      host = subject.host;
      const early = host.contextFor('early-plugin');
      early.registerProfile(PROFILE);
      let promise: Promise<unknown> | undefined;
      expect(() => (promise = watchOf(early)(PROFILE.id, () => undefined))).not.toThrow();
      await expect(promise).rejects.toMatchObject({ code: 'NOT_READY', retryable: true });
    });
  });
}

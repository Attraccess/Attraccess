import {
  PLUGIN_BLE_WATCH_LIMITS,
  type PluginBleContext,
  type PluginBleProfileDefinition,
  type PluginBleWatchEvent,
} from '@attraccess/plugins-backend-sdk';
import type { LoggerService } from '@nestjs/common';
import { Registry } from 'prom-client';
import { createPluginBleMetrics } from '../../metrics/definitions/plugin-ble.metrics';
import type { BleWatchDriverEvent } from './ble-transport-driver';
import { createHostBleHarness, type HostBleHarness } from './__test__/ble-host-harness.test-fixture';
import { closePluginBleSessions, createPluginBleContext } from './plugin-ble-context';
import type { PluginBleStore } from './plugin-ble-store.port';

/** `context.ble.watch`, which every host of this version has. */
const watchOf = (ctx: PluginBleContext) => {
  if (!ctx.watch) throw new Error('this host has no advertisement watch');
  return ctx.watch.bind(ctx);
};

const FFF0 = '0000fff0-0000-1000-8000-00805f9b34fb';
const service = {
  uuid: 'fff0',
  characteristics: [{ key: 'info', uuid: 'fff1', operations: ['read'], maxReadBytes: 4 }],
};
const BY_SERVICE = { id: 'by-service', advertisement: { serviceUuids: ['fff0'] }, services: [service] };
const BY_NAME = { id: 'by-name', advertisement: { namePrefix: 'Dev' }, services: [service] };
const BOTH = { id: 'both', advertisement: { serviceUuids: ['fff0'], namePrefix: 'Dev' }, services: [service] };

const event = (filterIds: number[], overrides: Partial<BleWatchDriverEvent> = {}): BleWatchDriverEvent => ({
  address: 'AA:BB:CC:DD:EE:01',
  addressType: 'public',
  name: 'Dev 1',
  serviceUuids: [FFF0],
  manufacturerData: [],
  filterIds,
  changed: true,
  receivedAt: new Date(0),
  ...overrides,
});

describe('PluginBleWatchManager (host routing and cleanup)', () => {
  let harness: HostBleHarness;
  let a: PluginBleContext;
  let b: PluginBleContext;
  let registry: Registry;
  const warn = jest.fn();

  const context = (id: string) => {
    const logger: LoggerService = { log: jest.fn(), error: jest.fn(), warn, debug: jest.fn() };
    return createPluginBleContext({ id, logger }, () => harness.service);
  };
  const watch = async (ctx: PluginBleContext, profileId: string, options = {}) => {
    const events: PluginBleWatchEvent[] = [];
    const handle = await watchOf(ctx)(profileId, (received) => void events.push(received), options);
    return { handle, events };
  };
  const set = (readerId = 1) => harness.driver.watchSets.get(readerId);
  const deliver = async (events: BleWatchDriverEvent[], readerId = 1) => {
    set(readerId)?.listener.onWatchEvents(readerId, events);
    await harness.advance(0);
  };
  const metric = async (name: string, labels: Record<string, string> = {}) => {
    const values = (await registry.getSingleMetric(name)?.get())?.values ?? [];
    const match = values.find((value) => Object.entries(labels).every(([key, v]) => value.labels[key] === v));
    return match?.value ?? 0;
  };

  beforeEach(async () => {
    harness = await createHostBleHarness();
    registry = new Registry();
    (harness.service as unknown as { metrics: unknown }).metrics = createPluginBleMetrics(registry);
    warn.mockClear();
    a = context('plugin-a');
    b = context('plugin-b');
    for (const profile of [BY_SERVICE, BY_NAME, BOTH]) {
      a.registerProfile(profile as unknown as PluginBleProfileDefinition);
      b.registerProfile(profile as unknown as PluginBleProfileDefinition);
    }
    await harness.addReader({ readerId: 1, name: 'Workshop', allowPluginBle: true });
    await harness.addReader({ readerId: 2, name: 'Office', allowPluginBle: true });
  });

  afterEach(() => harness.dispose());

  describe('the per-reader filter union', () => {
    it('sends one filter per distinct profile filter, shared by watches with an equal one', async () => {
      await watch(a, 'by-service');
      await watch(b, 'by-service');
      await watch(b, 'by-name');
      expect(set()?.filters).toEqual([
        { id: 1, serviceUuids: [FFF0], manufacturerIds: [] },
        { id: 2, serviceUuids: [], manufacturerIds: [], namePrefix: 'Dev' },
      ]);
      expect(set()?.keepaliveMs).toBe(PLUGIN_BLE_WATCH_LIMITS.keepaliveMs);
      expect(set(2)?.filters).toHaveLength(2);
    });

    it('drops a filter once its last watch closed, stops the reader with the last one, never reusing ids at once', async () => {
      const first = await watch(a, 'by-service');
      const second = await watch(a, 'by-name');
      await first.handle.close();
      expect(set()?.filters.map((filter) => filter.id)).toEqual([2]);
      await watch(a, 'by-service');
      expect(set()?.filters.map((filter) => filter.id)).toEqual([2, 3]);
      await second.handle.close();
      await harness.service.closePluginSessions('plugin-a');
      expect(set()).toBeUndefined();
      expect(await metric('attraccess_plugin_ble_watches_active')).toBe(0);
    });

    it('only covers readers open for plugins', async () => {
      await harness.setReaderAccess(2, false);
      await watch(a, 'by-service', { readerIds: [1, 2] });
      expect(set(2)).toBeUndefined();
      await harness.setReaderAccess(2, true);
      expect(set(2)?.filters).toHaveLength(1);
      await harness.removeReader(1);
      expect(set(1)).toBeUndefined();
    });

    describe('when a reader’s access changes while a watch checks the readers', () => {
      /** Holds the watch's reader query after it read, until the returned function is called. */
      const holdReaderCheck = () => {
        const store = (harness.service as unknown as { store: PluginBleStore }).store;
        const listOpenReaders = store.listOpenReaders.bind(store);
        let reached!: () => void;
        let release!: () => void;
        const read = new Promise<void>((resolve) => (reached = resolve));
        const held = new Promise<void>((resolve) => (release = resolve));
        jest.spyOn(store, 'listOpenReaders').mockImplementationOnce(async (readerIds) => {
          const rows = await listOpenReaders(readerIds);
          reached();
          await held;
          return rows;
        });
        return { read, release };
      };

      it('keeps a reader closed that was closed during the first watch’s check', async () => {
        const check = holdReaderCheck();
        const pending = watch(a, 'by-service', { readerIds: [1] });
        await check.read;
        await harness.setReaderAccess(1, false);
        check.release();
        const { handle } = await pending;

        expect(set(1)).toBeUndefined();
        expect(handle.readers()).toEqual([{ readerId: 1, status: 'access-denied' }]);
      });

      it('keeps a reader closed that was closed while another watch covered it', async () => {
        const other = await watch(b, 'by-name', { readerIds: [1] });
        const check = holdReaderCheck();
        const pending = watch(a, 'by-service', { readerIds: [1] });
        await check.read;
        await harness.setReaderAccess(1, false);
        check.release();
        const { handle } = await pending;

        expect(set(1)).toBeUndefined();
        expect(handle.readers()).toEqual([{ readerId: 1, status: 'access-denied' }]);
        expect(other.handle.readers()).toEqual([{ readerId: 1, status: 'access-denied' }]);
      });

      it('covers a reader opened during the check of a watch on every reader', async () => {
        await harness.setReaderAccess(2, false);
        const check = holdReaderCheck();
        const pending = watch(a, 'by-service');
        await check.read;
        await harness.setReaderAccess(2, true);
        check.release();
        const { handle } = await pending;

        expect(set(2)?.filters).toHaveLength(1);
        expect(handle.readers().map((reader) => reader.readerId)).toEqual([1, 2]);
      });
    });
  });

  describe('routing', () => {
    it('delivers by filter id only: another plugin’s filter never reaches a watch', async () => {
      const service = await watch(a, 'by-service');
      const name = await watch(b, 'by-name');
      // The device matches both profiles, but the reader named only plugin B's filter.
      await deliver([event([2])]);
      expect(service.events).toEqual([]);
      expect(name.events).toHaveLength(1);
      expect(name.events[0]).toMatchObject({ readerId: 1, changed: true, name: 'Dev 1' });
    });

    it('re-checks the full profile filter and drops what the reader matched loosely', async () => {
      const both = await watch(a, 'both');
      await deliver([event([1], { name: 'Other' }), event([1], { serviceUuids: [] }), event([1])]);
      expect(both.events).toHaveLength(1);
      expect(await metric('attraccess_plugin_ble_watch_events_received_total')).toBe(3);
      expect(await metric('attraccess_plugin_ble_watch_events_routed_total')).toBe(1);
      expect(await metric('attraccess_plugin_ble_watch_events_dropped_total', { reason: 'filter-mismatch' })).toBe(2);
    });

    it('drops unknown filter ids, malformed advertisements and events of a closed reader', async () => {
      const service = await watch(a, 'by-service');
      const listener = set()?.listener;
      await deliver([event([99]), event([1], { address: 'nope' })]);
      await harness.setReaderAccess(1, false);
      listener?.onWatchEvents(1, [event([1])]);
      await harness.advance(0);
      expect(service.events).toEqual([]);
      for (const reason of ['no-watch', 'malformed', 'access-denied']) {
        expect(await metric('attraccess_plugin_ble_watch_events_dropped_total', { reason })).toBe(1);
      }
      expect(service.handle.readers()[0]).toEqual({ readerId: 1, status: 'access-denied' });
    });

    it('counts events dropped from a full queue', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await watchOf(a)('by-service', () => gate);
      const burst = Array.from({ length: PLUGIN_BLE_WATCH_LIMITS.maxQueuedEvents + 3 }, () => event([1]));
      await deliver(burst);
      expect(await metric('attraccess_plugin_ble_watch_events_dropped_total', { reason: 'queue-full' })).toBe(3);
      release();
    });

    it('logs a failing handler to the plugin’s logger and keeps the watch', async () => {
      let calls = 0;
      await watchOf(a)('by-service', () => {
        calls++;
        throw new Error('plugin bug');
      });
      await deliver([event([1]), event([1])]);
      expect(calls).toBe(2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('handler callback failed: plugin bug'));
    });
  });

  describe('reader states', () => {
    it('reports filters the reader could not take as unsupported, with the driver’s detail', async () => {
      const first = await watch(a, 'by-service');
      const second = await watch(a, 'by-name');
      set()?.listener.onWatchState(1, { status: 'watching', excluded: [{ id: 2, detail: 'too-many-filters' }] });
      expect(first.handle.readers()[0]).toEqual({ readerId: 1, status: 'watching' });
      expect(second.handle.readers()[0]).toEqual({ readerId: 1, status: 'unsupported', detail: 'too-many-filters' });
    });

    it('reports every reader unsupported when the transport has no watch', async () => {
      (harness.driver as unknown as { setWatch?: unknown }).setWatch = undefined;
      const { handle } = await watch(a, 'by-service');
      expect(handle.readers()).toEqual([
        { readerId: 1, status: 'unsupported', detail: 'no-watch-transport' },
        { readerId: 2, status: 'unsupported', detail: 'no-watch-transport' },
      ]);
    });

    it('stays offline when the driver throws on a set', async () => {
      const setWatch = jest.spyOn(harness.driver, 'setWatch').mockImplementationOnce(() => {
        throw new Error('boom');
      });
      const { handle } = await watch(a, 'by-service', { readerIds: [1] });
      expect(setWatch).toHaveBeenCalled();
      expect(handle.readers()).toEqual([{ readerId: 1, status: 'offline', detail: 'watch-failed' }]);
    });
  });

  describe('limits and cleanup', () => {
    it('counts watches still checking readers toward the limit', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: PLUGIN_BLE_WATCH_LIMITS.maxWatchesPerPlugin + 1 }, () =>
          watchOf(a)('by-service', () => undefined),
        ),
      );
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'READER_BUSY',
        detail: 'watch-limit',
      });
    });

    it('closes the plugin’s watches when its module is destroyed, through the unload hook', async () => {
      const own = await watch(a, 'by-service');
      const other = await watch(b, 'by-service');
      const moduleRef = { get: () => harness.service } as never;
      await closePluginBleSessions(moduleRef, 'plugin-a', { warn: jest.fn() } as unknown as LoggerService);
      await expect(own.handle.closed).resolves.toEqual({ reason: 'shutdown' });
      expect(harness.openWatches()).toEqual([{ id: other.handle.id, pluginId: 'plugin-b', profileId: 'by-service' }]);
    });

    it('closes every watch when the host shuts down', async () => {
      const { handle } = await watch(a, 'by-service');
      await harness.service.onModuleDestroy();
      await expect(handle.closed).resolves.toEqual({ reason: 'shutdown' });
    });

    it('cancels a watch whose signal aborted while it checked the readers', async () => {
      const controller = new AbortController();
      const pending = watchOf(a)('by-service', () => undefined, { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
      expect(harness.openWatches()).toEqual([]);
    });
  });
});

import { flushMicrotasks } from './plugin-ble-fake-clock';
import type { PluginBleAdvertisement, PluginBleWatchEvent, PluginBleWatchReaderState } from './plugin-ble';
import {
  BLE_WATCH_MAX_READER_IDS,
  BleWatchEngine,
  bleWatchPayloadKey,
  matchesBleWatchFilter,
  resolveBleWatchOptions,
} from './plugin-ble-watch-engine';

const FFF0 = '0000fff0-0000-1000-8000-00805f9b34fb';
const advertisement: PluginBleAdvertisement = {
  address: 'AA:BB:CC:DD:EE:01',
  addressType: 'public',
  rssi: -50,
  name: 'Dev 1',
  serviceUuids: [FFF0],
  manufacturerData: [{ companyId: 7, data: Uint8Array.of(1) }],
};
const event = (name = 'Dev 1'): PluginBleWatchEvent => ({
  ...advertisement,
  name,
  readerId: 1,
  changed: true,
  receivedAt: new Date(0),
});

describe('advertisement watch engine', () => {
  describe('resolveBleWatchOptions', () => {
    it('validates the handler and options and removes duplicate reader ids', () => {
      expect(resolveBleWatchOptions(() => undefined, { readerIds: [2, 1, 2] })).toMatchObject({ readerIds: [2, 1] });
      expect(resolveBleWatchOptions(() => undefined)).toMatchObject({ readerIds: null });
      for (const [handler, options, detail] of [
        [undefined, {}, 'handler'],
        [() => undefined, null, 'options'],
        [() => undefined, { onReaderStatus: 1 }, 'onReaderStatus'],
        [() => undefined, { readerIds: new Array(BLE_WATCH_MAX_READER_IDS + 1).fill(1) }, 'readerIds'],
        [() => undefined, { readerIds: [1.5] }, 'readerIds[0]'],
      ] as const) {
        expect(() => resolveBleWatchOptions(handler, options)).toThrow(
          expect.objectContaining({ code: 'INVALID_ARGUMENT', detail }),
        );
      }
    });
  });

  it('matches a reader filter on any criterion, and keys payloads without the RSSI', () => {
    const filter = { serviceUuids: [], manufacturerIds: [7], namePrefix: 'Other' };
    expect(matchesBleWatchFilter(filter, advertisement)).toBe(true);
    expect(matchesBleWatchFilter({ serviceUuids: [], manufacturerIds: [], namePrefix: 'Dev' }, advertisement)).toBe(
      true,
    );
    expect(matchesBleWatchFilter({ serviceUuids: ['x'], manufacturerIds: [8] }, advertisement)).toBe(false);
    expect(bleWatchPayloadKey({ ...advertisement, rssi: -90 })).toBe(bleWatchPayloadKey(advertisement));
    expect(bleWatchPayloadKey({ ...advertisement, name: 'Dev 2' })).not.toBe(bleWatchPayloadKey(advertisement));
  });

  describe('BleWatchEngine', () => {
    const create = (overrides: Partial<ConstructorParameters<typeof BleWatchEngine>[0]> = {}) => {
      const statuses: PluginBleWatchReaderState[] = [];
      const errors: string[] = [];
      const onClosed = jest.fn();
      const engine = new BleWatchEngine({
        id: 'w1',
        profileId: 'p',
        handler: () => undefined,
        options: { readerIds: null, onReaderStatus: (state) => void statuses.push(state) },
        onCallbackError: (kind) => void errors.push(kind),
        onClosed,
        ...overrides,
      });
      return { engine, statuses, errors, onClosed };
    };

    it('reports a status only when it changed, serially, and survives a throwing callback', async () => {
      let calls = 0;
      const { engine, errors } = create({
        options: {
          readerIds: null,
          onReaderStatus: () => {
            calls++;
            throw new Error('plugin bug');
          },
        },
      });
      engine.setReaderStatus({ readerId: 1, status: 'watching' });
      engine.setReaderStatus({ readerId: 1, status: 'watching' });
      engine.setReaderStatus({ readerId: 1, status: 'offline' });
      await flushMicrotasks();
      expect(calls).toBe(2);
      expect(errors).toEqual(['status', 'status']);
      expect(engine.handle.readers()).toEqual([{ readerId: 1, status: 'offline' }]);
    });

    it('never runs the handler inside the caller, and hands out copies', async () => {
      const seen: PluginBleWatchEvent[] = [];
      const { engine } = create({ handler: (received) => void seen.push(received) });
      const original = event();
      engine.push(original);
      expect(seen).toEqual([]);
      await flushMicrotasks();
      expect(seen[0]).toEqual(original);
      expect(seen[0].manufacturerData[0].data).not.toBe(original.manufacturerData[0].data);
    });

    it('discards queued events and stops callbacks on close, once', async () => {
      const seen: string[] = [];
      const { engine, onClosed, statuses } = create({
        handler: (received) => void seen.push(received.name ?? ''),
        maxQueuedEvents: 2,
      });
      engine.push(event('a'));
      engine.push(event('b'));
      engine.push(event('c'));
      engine.setReaderStatus({ readerId: 1, status: 'watching' });
      await engine.handle.close();
      await engine.close('shutdown');
      await flushMicrotasks();
      expect(seen).toEqual([]);
      expect(statuses).toEqual([]);
      expect(onClosed).toHaveBeenCalledTimes(1);
      await expect(engine.handle.closed).resolves.toEqual({ reason: 'closed' });
      engine.push(event('d'));
      expect(engine.isClosed).toBe(true);
    });
  });
});

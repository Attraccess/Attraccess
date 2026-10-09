import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hash, JsonStateStore, WagoRuntime } from '../../runtime';

import { ModbusDeviceRouter } from './adapter';
import { ModbusTransportError } from '../transport/transport';

import { deferred, snapshot, harness, onboard, desired, command } from './review-regressions.test-utils';
describe('ATT-1059 independent review regressions', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('persists uncertainty before transmission and preserves the route after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wago-uncertain-output-'));
    const pending = deferred<Buffer>();
    const entered = deferred<void>();
    try {
      const s = snapshot();
      const path = join(directory, 'state.json');
      const store = new JsonStateStore(path);
      await store.save({ outputs: {}, commandIds: [], accepted: { revision: 1, contentHash: hash(s), snapshot: s } });
      const request = jest.fn(() => {
        entered.resolve();
        return pending.promise;
      });
      const publish = jest.fn(async () => undefined);
      const createRuntime = () =>
        new WagoRuntime({
          hardwareId: 'fixture',
          prefix: 'test',
          pairingCode: 'fixture',
          store: new JsonStateStore(path),
          device: new ModbusDeviceRouter(onboard, () => ({ request })),
          transport: { subscribe: async () => undefined, publish },
        });
      const runtime = createRuntime();
      await runtime.start();
      const writing = runtime.receiveCommand(command('incomplete-on'));
      await entered.promise;
      expect(await store.load()).toMatchObject({
        outputs: {},
        uncertainOutputChannelIds: ['output'],
        commandIds: ['incomplete-on'],
      });
      const restarted = createRuntime();
      await restarted.start();
      const next = structuredClone(s);
      next.modbus.devices[0].unitId = 2;
      await restarted.receiveDesired(desired(next));
      expect(publish).toHaveBeenCalledWith(
        expect.stringContaining('/configuration/reported'),
        {
          revision: 2,
          contentHash: hash(next),
          errors: [expect.objectContaining({ code: 'outputs_busy' })],
        },
        { retain: true },
      );
      await restarted.receiveCommand(command('incomplete-on'));
      expect(request).toHaveBeenCalledTimes(1);
      pending.reject(new Error('lost acknowledgement'));
      await writing;
      expect((await store.load()).uncertainOutputChannelIds).toEqual(['output']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not transmit until uncertainty is saved, and does not transmit when that save fails', async () => {
    const s = snapshot();
    const request = jest.fn(async (_unit: number, pdu: Buffer) => pdu);
    const { runtime, store } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
    await runtime.start();
    const held = deferred<void>();
    const entered = deferred<void>();
    const save = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementation(async (state) => {
      if (state.uncertainOutputChannelIds?.length) {
        entered.resolve();
        await held.promise;
      }
      await save(state);
    });
    const writing = runtime.receiveCommand(command('unsaved-on'));
    await entered.promise;
    expect(request).not.toHaveBeenCalled();
    const failure = expect(writing).rejects.toThrow('disk failure');
    held.reject(new Error('disk failure'));
    await failure;
    expect(request).not.toHaveBeenCalled();
  });

  it('releases a command reservation when Modbus rejects it before transmission', async () => {
    const s = snapshot();
    const request = jest.fn(async () => {
      throw new ModbusTransportError('modbus_queue_full', 'Modbus queue full');
    });
    const { runtime, store } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
    await runtime.start();
    await runtime.receiveCommand(command('queue-full'));
    expect(store.saved.commandIds).toEqual([]);
    await runtime.receiveCommand(command('queue-full'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each(['disconnect', 'pulse'])(
    'attempts scheduled %s LOW despite storage failure and reports configuration persistence failure',
    async (mode) => {
      jest.useFakeTimers();
      const s = snapshot();
      if (mode === 'pulse') {
        s.logicalChannels[1].capabilities.push('pulse');
        Object.assign(s.logicalChannels[1], { pulse: { durationMs: 10 } });
      }
      const values: number[] = [];
      const request = jest.fn(async (_unit: number, pdu: Buffer) => {
        values.push(pdu.readUInt16BE(3));
        return pdu;
      });
      const { runtime, store, published } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
      await runtime.start();
      await runtime.receiveCommand(
        mode === 'pulse'
          ? Buffer.from(
              JSON.stringify({
                id: 'energize',
                channelId: 'output',
                action: 'pulse',
                expectedConfigurationRevision: 1,
                expiresAt: '2099-01-01T00:00:00.000Z',
              }),
            )
          : command('energize'),
      );
      expect(store.saved).toMatchObject({ outputs: { output: true }, uncertainOutputChannelIds: [] });
      jest.spyOn(store, 'save').mockRejectedValue(new Error('disk failure'));
      if (mode === 'disconnect') await expect(runtime.setConnected(false)).rejects.toThrow('disk failure');
      else await jest.advanceTimersByTimeAsync(10);
      expect(values).toEqual([1, 0]);
      // The confirmation could not be saved: restart must still treat the old route as energized.
      expect(store.saved).toMatchObject({ outputs: { output: true }, uncertainOutputChannelIds: [] });
      const next = structuredClone(s);
      next.modbus.profiles[0].actions[0].address = 22;
      await runtime.receiveDesired(desired(next));
      expect(published.at(-1)?.payload.errors).toEqual([
        expect.objectContaining({ code: mode === 'pulse' ? 'configuration_commit_failed' : 'outputs_busy' }),
      ]);
      jest.restoreAllMocks();
      const restarted = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })), store);
      await restarted.runtime.start();
      await restarted.runtime.receiveDesired(desired(next));
      expect(store.saved.accepted?.revision).toBe(mode === 'pulse' ? 2 : 1);
      expect(restarted.published).toContainEqual(
        expect.objectContaining({
          payload: {
            revision: 2,
            contentHash: hash(next),
            errors: mode === 'pulse' ? [] : [expect.objectContaining({ code: 'outputs_busy' })],
          },
        }),
      );
      await jest.advanceTimersByTimeAsync(100);
      expect(values[0]).toBe(1);
      expect(values.slice(1).every((value) => value === 0)).toBe(true);
      if (mode === 'pulse') expect(values.length).toBeGreaterThan(2);
      else expect(values).toEqual([1, 0]);
    },
  );

  it('retains write uncertainty on failed LOW persistence and blocks route changes', async () => {
    const s = snapshot();
    const request = jest.fn(async (_unit: number, pdu: Buffer) => pdu);
    const { runtime, store } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
    await runtime.start();
    await runtime.receiveCommand(command('confirmed-on'));
    const save = store.save.bind(store);
    const saving = jest.spyOn(store, 'save').mockImplementation(async (state) => {
      if (state.outputs.output === false && !state.uncertainOutputChannelIds?.length) throw new Error('disk failure');
      await save(state);
    });
    await expect(runtime.receiveCommand(command('off-save-fails', false))).rejects.toThrow(
      'failed to persist channel state',
    );
    expect(store.saved.outputs.output).toBe(true);
    saving.mockRestore();
    const next = structuredClone(s);
    next.modbus.devices[0].unitId = 2;
    await runtime.receiveDesired(desired(next));
    expect(store.saved.accepted?.revision).toBe(1);
    expect(store.saved.outputs.output).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    await runtime.receiveCommand(command('retry-off', false));
    await runtime.receiveDesired(desired(next));
    expect(store.saved.accepted?.revision).toBe(2);
    expect(store.saved.uncertainOutputChannelIds).toEqual([]);
  });
});

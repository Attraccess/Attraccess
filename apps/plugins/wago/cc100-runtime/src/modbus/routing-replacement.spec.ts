import { hash, type Snapshot } from '../runtime';

import { ModbusDeviceRouter } from './adapter';
import { QueuedModbusTransport } from './transports';
import { rtuFrame } from './protocol';

import { deferred, snapshot, harness, onboard, desired, command } from './review-regressions.test-utils';
describe('ATT-1059 independent review regressions', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it.each([true, false, undefined])(
    'preserves routing during replacement when the previous output state is %s',
    async (value) => {
      const s = snapshot();
      const request = jest.fn(async (_unit: number, pdu: Buffer) => pdu);
      const { runtime, store, published } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
      if (value !== undefined) store.saved.outputs.output = value;
      else store.saved.uncertainOutputChannelIds = ['output'];
      await runtime.start();
      const next = structuredClone(s);
      const connection = next.modbus.connections[0];
      if (connection.transport !== 'rtu') throw new Error('Fixture requires RTU');
      connection.parity = 'none';
      await runtime.receiveDesired(desired(next));
      expect(store.saved.accepted?.revision).toBe(value === false ? 2 : 1);
      expect(request).not.toHaveBeenCalled();
      expect(published).toContainEqual(
        expect.objectContaining({
          payload: {
            revision: 2,
            contentHash: hash(next),
            errors: value === false ? [] : [expect.objectContaining({ code: 'outputs_busy' })],
          },
        }),
      );
    },
  );

  it('publishes an actual 879-3020 float register as integer millivolts', async () => {
    const s: Snapshot = snapshot();
    if (!s.modbus) throw new Error('Missing fixture configuration');
    s.modbus.devices[0].profileId = 'wago-879-3020';
    s.modbus.profiles = [];
    s.physicalPoints[0].modbus = { deviceId: 'device', measurementId: 'voltage-l1' };
    s.logicalChannels = [
      {
        id: 'voltage',
        physicalPointId: 'point',
        profile: 'metered-switched-load',
        capabilities: ['measurement'],
        disconnectPolicy: { mode: 'hold' },
        measurement: { unit: 'volt', scale: 1, offset: 0, kind: 'live' },
      },
    ];
    // Captured FC03 register bytes: 232.07000732421875 V, the meter's 232.07 V reading.
    const router = new ModbusDeviceRouter(onboard, () => ({ request: async () => Buffer.from('436811ec', 'hex') }));
    const { runtime, published } = harness(s, router);
    await runtime.start();
    await runtime.publishMeasurements();
    expect(published.filter(({ topic }) => topic.endsWith('/measurements'))).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ channelId: 'voltage', value: 232070, unit: 'millivolt' }),
      }),
    ]);
    expect(published.some(({ topic }) => topic.endsWith('/faults'))).toBe(false);
  });

  it.each(['remove', 'rebind'])('rejects route %s with an uncertain output, including after restart', async (mode) => {
    const s = snapshot();
    const request = jest.fn(async () => {
      throw new Error('timeout after actuator applied ON');
    });
    const { runtime, store } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
    await runtime.start();
    await runtime.receiveCommand(command('ambiguous-on'));
    expect(store.saved.uncertainOutputChannelIds).toEqual(['output']);
    const next: Snapshot = structuredClone(s);
    if (mode === 'remove') {
      next.logicalChannels = [];
      next.physicalPoints = [];
      next.modbus.devices = [];
    } else next.modbus.profiles[0].actions[0].address = 22;
    await runtime.receiveDesired(desired(next));
    expect(store.saved.accepted?.revision).toBe(1);
    const restarted = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })), store);
    await restarted.runtime.start();
    await restarted.runtime.receiveDesired(desired(next, 3));
    expect(store.saved.accepted?.revision).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.saved.uncertainOutputChannelIds).toEqual(['output']);
  });

  it.each(['remove', 'rebind'])('cancels a queued router ON after device %s', async (mode) => {
    const s = snapshot();
    const reply = deferred<Buffer>();
    const started = deferred<void>();
    const exchange = jest.fn(async () => {
      started.resolve();
      return reply.promise;
    });
    const router = new ModbusDeviceRouter(onboard, (c) => new QueuedModbusTransport(c, exchange));
    router.configure(s);
    const read = router.read(s.physicalPoints[0]).catch((e: Error) => e);
    await started.promise;
    const write = router.write(s.physicalPoints[0], true).catch((e: Error) => e);
    const next = structuredClone(s);
    if (mode === 'remove') next.modbus.devices = [];
    else next.modbus.devices[0].unitId = 2;
    router.configure(next);
    reply.resolve(rtuFrame(1, Buffer.from([3, 2, 0, 1])));
    await read;
    expect(await write).toBeInstanceOf(Error);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('does not route commands during held configuration persistence', async () => {
    const s = snapshot();
    const writes: number[] = [];
    const router = new ModbusDeviceRouter(onboard, () => ({
      request: async (_unit, pdu) => {
        writes.push(pdu.readUInt16BE(1));
        return pdu;
      },
    }));
    const { runtime, store } = harness(s, router);
    await runtime.start();
    const held = deferred<void>();
    const entered = deferred<void>();
    const save = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementationOnce(async (state) => {
      entered.resolve();
      await held.promise;
      await save(state);
    });
    const next = structuredClone(s);
    next.modbus.profiles[0].actions[0].address = 22;
    const apply = runtime.receiveDesired(desired(next));
    await entered.promise;
    await runtime.receiveCommand(command('during-save'));
    expect(writes).toEqual([]);
    held.resolve();
    await apply;
    await runtime.receiveCommand(command('after-save', true, 2));
    expect(writes).toEqual([22]);
  });

  it('retains old snapshot and route after failed configuration persistence', async () => {
    const s = snapshot();
    const writes: number[] = [];
    const router = new ModbusDeviceRouter(onboard, () => ({
      request: async (_unit, pdu) => {
        writes.push(pdu.readUInt16BE(1));
        return pdu;
      },
    }));
    const { runtime, store } = harness(s, router);
    await runtime.start();
    const next = structuredClone(s);
    next.physicalPoints[0].modbus.actionId = 'new-action';
    next.modbus.profiles[0].actions[0].id = 'new-action';
    next.modbus.profiles[0].actions[0].address = 22;
    jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk failure'));
    await runtime.receiveDesired(desired(next));
    await runtime.receiveCommand(command('after-failure'));
    expect(writes).toEqual([12]);
    expect(store.saved.accepted?.revision).toBe(1);
  });

  it.each(['rebind', 'remove', 'restart'])(
    'keeps an active pulse duration and original route across configuration %s',
    async (mode) => {
      jest.useFakeTimers();
      const s = snapshot();
      s.logicalChannels[1].capabilities.push('pulse');
      Object.assign(s.logicalChannels[1], { pulse: { durationMs: 10 } });
      const writes: Array<{ address: number; value: number }> = [];
      const router = () =>
        new ModbusDeviceRouter(onboard, () => ({
          request: async (_unit, pdu) => {
            writes.push({ address: pdu.readUInt16BE(1), value: pdu.readUInt16BE(3) });
            return pdu;
          },
        }));
      const { runtime, store, published } = harness(s, router());
      await runtime.start();
      await runtime.receiveCommand(
        Buffer.from(
          JSON.stringify({
            id: 'pulse',
            channelId: 'output',
            action: 'pulse',
            expectedConfigurationRevision: 1,
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
        ),
      );
      const next = structuredClone(s);
      if (mode === 'remove') {
        next.logicalChannels = [];
        next.physicalPoints = [];
        next.modbus.devices = [];
      } else next.modbus.profiles[0].actions[0].address = 22;
      await runtime.receiveDesired(desired(next));
      expect(store.saved.accepted?.revision).toBe(2);
      expect(published).toContainEqual(
        expect.objectContaining({ payload: { revision: 2, contentHash: hash(next), errors: [] } }),
      );
      expect(writes).toEqual([{ address: 12, value: 1 }]);
      if (mode === 'restart') {
        jest.clearAllTimers();
        const restarted = harness(next, router(), store);
        await restarted.runtime.start();
        await jest.advanceTimersByTimeAsync(1);
      } else {
        await jest.advanceTimersByTimeAsync(9);
        expect(writes).toEqual([{ address: 12, value: 1 }]);
        await jest.advanceTimersByTimeAsync(1);
      }
      expect(writes).toEqual([
        { address: 12, value: 1 },
        { address: 12, value: 0 },
      ]);
      expect(store.saved.pendingPulseRoutes).toEqual([]);
    },
  );
});

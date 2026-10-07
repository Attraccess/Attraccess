import { type RuntimeState } from '../runtime';
import { OutputController } from '../output-controller';
import { ModbusDeviceRouter } from './adapter';
import { QueuedModbusTransport } from './transports';
import { rtuFrame } from './protocol';

import { deferred, snapshot, MemoryStore, harness, onboard } from './review-regressions.test-utils';
describe('disconnect ordering regressions', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  it('cancels a watchdog OFF already queued when the connection returns', async () => {
    jest.useFakeTimers();
    const s = snapshot();
    Object.assign(s.logicalChannels[1], { disconnectPolicy: { mode: 'watchdog', timeoutMs: 10 } });
    const write = jest.fn(async () => undefined);
    const state: RuntimeState = { outputs: { output: true }, commandIds: [] };
    const outputs = new OutputController({
      device: { read: async () => false, write },
      getSnapshot: () => s,
      getState: () => state,
      saveState: async () => undefined,
      publishState: () => undefined,
      publishFault: async () => undefined,
    });
    const release = deferred<void>();
    const blocked = outputs.runForChannel('output', () => release.promise);
    await outputs.applyDisconnectPolicies(false);
    await jest.advanceTimersByTimeAsync(10);
    await outputs.applyDisconnectPolicies(true);
    release.resolve();
    await blocked;
    await jest.advanceTimersByTimeAsync(0);
    expect(write).not.toHaveBeenCalled();
    await outputs.applyDisconnectPolicies(false);
    await jest.advanceTimersByTimeAsync(10);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('cancels watchdog OFF at the Modbus bus queue after its channel was acquired', async () => {
    jest.useFakeTimers();
    const s = snapshot();
    Object.assign(s.logicalChannels[1], { disconnectPolicy: { mode: 'watchdog', timeoutMs: 10 } });
    const entered = deferred<void>();
    const release = deferred<Buffer>();
    const serial = jest.fn(async () => {
      entered.resolve();
      return release.promise;
    });
    const bus = new QueuedModbusTransport({ ...s.modbus.connections[0], timeoutMs: 1000 }, serial);
    const { runtime } = harness(s, new ModbusDeviceRouter(onboard, () => bus));
    await runtime.start();
    const blocking = bus.request(1, Buffer.from([6, 0, 20, 0, 1]));
    await entered.promise;
    await runtime.setConnected(false);
    await jest.advanceTimersByTimeAsync(10);
    await runtime.setConnected(true);
    release.resolve(rtuFrame(1, Buffer.from([6, 0, 20, 0, 1])));
    await blocking;
    await jest.advanceTimersByTimeAsync(0);
    expect(serial).toHaveBeenCalledTimes(1);
  });

  it('applies restored immediate output policy when disconnected before load completes', async () => {
    const s = snapshot();
    const request = jest.fn(async (_unit, pdu: Buffer) => pdu);
    const store = new MemoryStore(s);
    store.saved.outputs.output = true;
    const loaded = structuredClone(store.saved);
    const release = deferred<RuntimeState>();
    const save = jest.spyOn(store, 'save');
    jest.spyOn(store, 'load').mockReturnValue(release.promise);
    const { runtime } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })), store);
    const starting = runtime.start();
    await runtime.setConnected(false);
    expect(save).not.toHaveBeenCalled();
    release.resolve(loaded);
    await starting;
    await runtime.setConnected(false);
    expect(request).toHaveBeenCalledWith(1, Buffer.from([6, 0, 12, 0, 0]), expect.any(Function));
    expect(store.saved.outputs.output).toBe(false);
  });
});

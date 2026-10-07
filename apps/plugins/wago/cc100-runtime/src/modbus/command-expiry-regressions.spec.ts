import { ModbusDeviceRouter } from './adapter';
import { QueuedModbusTransport } from './transports';
import { rtuFrame } from './protocol';

import { deferred, snapshot, MemoryStore, harness, onboard, desired, command } from './review-regressions.test-utils';
describe('ATT-973 runtime independent findings', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('rejects expiry during uncertainty persistence without sending ON', async () => {
    const s = snapshot();
    const request = jest.fn(async (_unit, pdu: Buffer) => pdu);
    const store = new MemoryStore(s);
    const { runtime, published } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })), store);
    await runtime.start();
    const entered = deferred<void>();
    const resume = deferred<void>();
    const save = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementation(async (state) => {
      if (state.uncertainOutputChannelIds?.length) {
        entered.resolve();
        await resume.promise;
      }
      await save(state);
    });
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const executing = runtime.receiveCommand(
      Buffer.from(
        JSON.stringify({ ...JSON.parse(command('expires').toString()), expiresAt: new Date(now + 10).toISOString() }),
      ),
    );
    await entered.promise;
    jest.spyOn(Date, 'now').mockReturnValue(now + 11);
    resume.resolve();
    await executing;
    expect(request).not.toHaveBeenCalled();
    expect(published.at(-1)?.payload).toMatchObject({ status: 'rejected', code: 'expired' });
    expect(store.saved.uncertainOutputChannelIds).toEqual([]);
  });

  it('checks expiry again after waiting behind another Modbus transaction', async () => {
    const s = snapshot();
    const entered = deferred<void>();
    const release = deferred<Buffer>();
    const serial = jest.fn(async () => {
      entered.resolve();
      return release.promise;
    });
    const bus = new QueuedModbusTransport(s.modbus.connections[0], serial);
    const { runtime, published } = harness(s, new ModbusDeviceRouter(onboard, () => bus));
    await runtime.start();
    const blocking = bus.request(1, Buffer.from([6, 0, 20, 0, 1]));
    await entered.promise;
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const executing = runtime.receiveCommand(
      Buffer.from(
        JSON.stringify({
          ...JSON.parse(command('queued-expiry').toString()),
          expiresAt: new Date(now + 10).toISOString(),
        }),
      ),
    );
    for (let i = 0; i < 50; i++) await Promise.resolve();
    jest.spyOn(Date, 'now').mockReturnValue(now + 11);
    release.resolve(rtuFrame(1, Buffer.from([6, 0, 20, 0, 1])));
    await blocking;
    await executing;
    expect(serial).toHaveBeenCalledTimes(1);
    expect(published.at(-1)?.payload).toMatchObject({ status: 'rejected', code: 'expired' });
  });

  it.each([false, true])(
    'recovers pulse shutdown on its original route after restart (ambiguous=%s)',
    async (ambiguous) => {
      jest.useFakeTimers();
      const s = snapshot();
      s.logicalChannels[1].capabilities.push('pulse');
      Object.assign(s.logicalChannels[1], { pulse: { durationMs: 1000 } });
      const firstRequest = jest.fn(async (_unit, pdu: Buffer) => {
        if (ambiguous) throw new Error('lost ON response');
        return pdu;
      });
      const first = harness(s, new ModbusDeviceRouter(onboard, () => ({ request: firstRequest })));
      await first.runtime.start();
      await first.runtime.receiveCommand(
        Buffer.from(JSON.stringify({ ...JSON.parse(command('pulse-crash').toString()), action: 'pulse' })),
      );
      jest.clearAllTimers(); // Process dies before its volatile pulse timer.
      const retry = jest.fn(async (_unit, pdu: Buffer) => pdu).mockRejectedValueOnce(new Error('OFF unavailable'));
      const restarted = harness(s, new ModbusDeviceRouter(onboard, () => ({ request: retry })), first.store);
      await restarted.runtime.start();
      await jest.advanceTimersByTimeAsync(100);
      expect(retry).toHaveBeenCalledWith(1, Buffer.from([6, 0, 12, 0, 0]), expect.any(Function));
      await jest.advanceTimersByTimeAsync(5000);
      expect(retry.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(first.store.saved.outputs.output).toBe(false);
      const changed = structuredClone(s);
      changed.modbus.profiles[0].actions[0].address = 30;
      await restarted.runtime.receiveDesired(desired(changed));
      expect(first.store.saved.accepted?.revision).toBe(2);
    },
  );
});

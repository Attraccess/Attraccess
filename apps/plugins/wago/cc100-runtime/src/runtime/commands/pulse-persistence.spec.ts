import { MemoryDeviceAdapter } from '../../io/adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from '../../runtime';
import {
  TestTransport,
  snapshot,
  pulsedSnapshot,
  desired,
  commands,
  validCommand,
  createRuntimeFixture,
} from '../../runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it('does not acknowledge a pulse when persisting its output state fails', async () => {
    const snapshot = pulsedSnapshot;
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    const persist = store.save.bind(store);
    const save = jest.spyOn(store, 'save');
    save.mockImplementationOnce(persist).mockImplementationOnce(persist).mockRejectedValueOnce(new Error('disk full'));

    await expect(transport.send(commands, validCommand({ action: 'pulse' }))).rejects.toThrow(
      'failed to persist channel state',
    );

    expect(device.values.get('751-9301:0')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(device.values.get('751-9301:0')).toBe(false);
    expect(transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'accepted' }),
      }),
    );
  });

  it('shuts off an accepted pulse after a newer pulse fails', async () => {
    // Advance shutoff time only after both admitted writes have settled.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const snapshot = pulsedSnapshot;
      const pulseSnapshot: Snapshot = {
        ...snapshot,
        logicalChannels: snapshot.logicalChannels.map((channel) => ({
          ...channel,
          pulse: { durationMs: 100 },
        })),
      };
      let resolvePulseWrite: (() => void) | undefined;
      let notifyPulseWriteStarted: (() => void) | undefined;
      const pulseWriteStarted = new Promise<void>((resolve) => {
        notifyPulseWriteStarted = resolve;
      });
      const writes: boolean[] = [];
      const delayedPulseDevice = {
        write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
          writes.push(value);
          if (writes.length === 1) {
            notifyPulseWriteStarted?.();
            await new Promise<void>((resolve) => {
              resolvePulseWrite = resolve;
            });
          } else if (value) throw new Error('temporary failure');
        },
        read: async () => false,
      };
      runtime = new WagoRuntime({
        pairingCode: 'fixture',
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
        transport,
        device: delayedPulseDevice,
      });
      await runtime.start();
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(pulseSnapshot),
        snapshot: pulseSnapshot,
      });

      const pulse = transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
      await pulseWriteStarted;
      const repeatedPulse = transport.send(
        commands,
        validCommand({ id: 'command-2', channelId: 'load', action: 'pulse' }),
      );
      resolvePulseWrite?.();
      await pulse;
      await repeatedPulse;
      await jest.advanceTimersByTimeAsync(150);

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
          payload: expect.objectContaining({ id: 'command-1', status: 'accepted', error: undefined }),
        }),
      );
      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
          payload: expect.objectContaining({ id: 'command-2', status: 'rejected', error: 'device write failed' }),
        }),
      );
      expect(writes).toEqual([true, true, false]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shuts off a delayed pulse after a newer pulse succeeds', async () => {
    // A generous pulse duration keeps the repeated pulse's registration safely ahead of the
    // first shutoff timer on loaded runners; the property under test is the cancellation of
    // the superseded shutoff, not the timer granularity.
    const snapshot: Snapshot = {
      ...pulsedSnapshot,
      logicalChannels: [{ ...pulsedSnapshot.logicalChannels[0], pulse: { durationMs: 250 } }],
    };
    let resolvePulseWrite: (() => void) | undefined;
    let notifyPulseWriteStarted: (() => void) | undefined;
    const pulseWriteStarted = new Promise<void>((resolve) => {
      notifyPulseWriteStarted = resolve;
    });
    const writes: boolean[] = [];
    const delayedPulseDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (writes.length === 1) {
          notifyPulseWriteStarted?.();
          await new Promise<void>((resolve) => {
            resolvePulseWrite = resolve;
          });
        }
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: delayedPulseDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    const pulse = transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
    await pulseWriteStarted;
    const repeatedPulse = transport.send(
      commands,
      validCommand({ id: 'command-2', channelId: 'load', action: 'pulse' }),
    );
    resolvePulseWrite?.();
    await pulse;
    await repeatedPulse;
    expect(writes).toEqual([true, true]);

    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && writes.length < 3) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(writes).toEqual([true, true, false]);
  }, 15000);

  it('does not let a stale pulse shutoff override a set command after changing to switched behavior', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      let resolvePulseWrite: (() => void) | undefined;
      let notifyPulseWriteStarted: (() => void) | undefined;
      const pulseWriteStarted = new Promise<void>((resolve) => {
        notifyPulseWriteStarted = resolve;
      });
      const writes: boolean[] = [];
      const delayedPulseDevice = {
        write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
          writes.push(value);
          if (writes.length === 1) {
            notifyPulseWriteStarted?.();
            await new Promise<void>((resolve) => {
              resolvePulseWrite = resolve;
            });
          }
        },
        read: async () => false,
      };
      runtime = new WagoRuntime({
        pairingCode: 'fixture',
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
        transport,
        device: delayedPulseDevice,
      });
      await runtime.start();
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(pulsedSnapshot),
        snapshot: pulsedSnapshot,
      });

      const pulse = transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
      await pulseWriteStarted;
      const replacement = transport.send(desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(snapshot),
        snapshot,
      });
      resolvePulseWrite?.();
      await Promise.all([pulse, replacement]);
      await transport.send(commands, validCommand({ id: 'command-2', expectedConfigurationRevision: 2 }));
      await jest.advanceTimersByTimeAsync(20);

      expect(writes).toEqual([true, true]);
    } finally {
      jest.useRealTimers();
    }
  });
});

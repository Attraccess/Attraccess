import { MemoryDeviceAdapter } from '../../io/adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot, type Transport } from '../../runtime';
import {
  TestTransport,
  commands,
  createRuntimeFixture,
  desired,
  pulsedSnapshot,
  snapshot,
  validCommand,
} from '../../runtime.test-utils';

describe('WagoRuntime pulse lifecycle', () => {
  let transport: TestTransport;

  let device: MemoryDeviceAdapter;

  let runtime: WagoRuntime;

  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });

  it('does not repeat an unexpired pulse after a runtime reboot', async () => {
    const snapshot = pulsedSnapshot;
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: transport,
      device: device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
    await transport.send(
      commands,
      validCommand({
        id: 'durable-pulse',
        expiresAt: '2099-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'pulse',
        expectedConfigurationRevision: 1,
      }),
    );
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: transport,
      device: device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
    await transport.send(
      commands,
      validCommand({
        id: 'durable-pulse',
        expiresAt: '2099-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'pulse',
        expectedConfigurationRevision: 1,
      }),
    );

    expect(
      transport.published.filter(
        (message) =>
          message.payload &&
          typeof message.payload === 'object' &&
          (message.payload as { id?: string }).id === 'durable-pulse',
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ status: 'duplicate' }) })]),
    );
  });

  it('deactivates a pulse when retained state publication fails after it turns on', async () => {
    const snapshot = pulsedSnapshot;
    let failStatePublication = false;
    const failingTransport: Transport = {
      publish: async (topic, payload, options) => {
        if (failStatePublication && topic.endsWith('/state')) throw new Error('broker unavailable');
        await transport.publish(topic, payload, options);
      },
      subscribe: async (topic, listener) => transport.subscribe(topic, listener),
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: failingTransport,
      device: device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
    failStatePublication = true;

    await transport.send(commands, validCommand({ action: 'pulse' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(device.values.get('751-9301:0')).toBe(false);
  });

  it('retries a failed scheduled pulse shutdown', async () => {
    const snapshot = pulsedSnapshot;
    const writes: boolean[] = [];
    let shutdownCompleted: () => void = () => undefined;
    const shutdown = new Promise<void>((resolve) => {
      shutdownCompleted = resolve;
    });
    const flakyDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (!value && writes.filter((written) => !written).length === 1) throw new Error('temporary shutdown failure');
        if (!value) shutdownCompleted();
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
      device: flakyDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
    await transport.send(commands, validCommand({ action: 'pulse' }));

    await shutdown;

    expect(writes).toEqual([true, false, false]);
  });

  it('keeps active pulses until their deadline after applying a replacement configuration', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const snapshot = pulsedSnapshot;
      const replacement: Snapshot = {
        ...snapshot,
        physicalPoints: [{ id: 'output-2', hardwareProfile: '751-9301', channel: 1 }],
        logicalChannels: [{ ...snapshot.logicalChannels[0], physicalPointId: 'output-2' }],
      };
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(snapshot),
        snapshot,
      });
      await transport.send(commands, validCommand({ action: 'pulse' }));

      await transport.send(desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(replacement),
        snapshot: replacement,
      });

      await jest.advanceTimersByTimeAsync(9);
      expect(device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(1);
      expect(device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies configuration while a scheduled pulse shutdown keeps retrying', async () => {
    const snapshot = pulsedSnapshot;
    jest.useFakeTimers();
    let failShutdown = false;
    let shutdownAttempts = 0;
    const flakyDevice = {
      write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (failShutdown && !value) {
          shutdownAttempts += 1;
          throw new Error('relay write failed');
        }
        device.values.set(`${point.hardwareProfile}:${point.channel}`, value);
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
      device: flakyDevice,
    });
    try {
      await runtime.start();
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(snapshot),
        snapshot,
      });
      await transport.send(commands, validCommand({ action: 'pulse' }));
      failShutdown = true;

      await transport.send(desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(snapshot),
        snapshot,
      });

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
          payload: expect.objectContaining({ revision: 2, errors: [] }),
        }),
      );
      expect(shutdownAttempts).toBe(0);
      await jest.advanceTimersByTimeAsync(3_110);
      expect(shutdownAttempts).toBe(6);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(shutdownAttempts).toBe(7);

      failShutdown = false;
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 3,
        contentHash: hash(snapshot),
        snapshot,
      });

      expect(device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(device.values.get('751-9301:0')).toBe(false);
      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
          payload: expect.objectContaining({ revision: 3, errors: [] }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('shuts down a pulse that completes while configuration replacement is waiting', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const snapshot = pulsedSnapshot;
      let releaseWrite!: () => void;
      let writeStarted!: () => void;
      const write = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const started = new Promise<void>((resolve) => {
        writeStarted = resolve;
      });
      const delayedDevice = {
        write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
          if (value) {
            writeStarted();
            await write;
          }
          device.values.set(`${point.hardwareProfile}:${point.channel}`, value);
        },
        read: async () => false,
      };
      runtime = new WagoRuntime({
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        pairingCode: '482931',
        store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
        transport: transport,
        device: delayedDevice,
      });
      await runtime.start();
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(snapshot),
        snapshot,
      });

      const pulse = transport.send(commands, validCommand({ action: 'pulse' }));
      await started;
      const replacement = transport.send(desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(snapshot),
        snapshot,
      });
      releaseWrite();
      await Promise.all([pulse, replacement]);

      expect(device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(20);
      expect(device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([true, false])('rejects set %s without cancelling a pending pulse shutdown', async (value) => {
    const snapshot = pulsedSnapshot;
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });

    await transport.send(commands, validCommand({ id: 'pulse', action: 'pulse' }));
    await transport.send(commands, validCommand({ id: 'set', value }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'set', status: 'rejected', code: 'unsupported_operation' }),
      }),
    );
    expect(device.values.get('751-9301:0')).toBe(false);
  });

  it('does not acknowledge a pulse when persisting its output state fails', async () => {
    const snapshot = pulsedSnapshot;
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: transport,
      device: device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
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
    // Control the test clock so disk persistence cannot expire the pulse before both writes settle.
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
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
        transport: transport,
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
      expect(writes).toEqual([true, true]);
      await jest.advanceTimersByTimeAsync(99);
      expect(writes).toEqual([true, true]);
      await jest.advanceTimersByTimeAsync(1);

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
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
      device: delayedPulseDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
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
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
        transport: transport,
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
        snapshot: snapshot,
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

  it.each([false, true])(
    'verifies final OFF feedback %s while pulse shutdown persistence is pending',
    async (feedback) => {
      const monitored: Snapshot = {
        ...snapshot,
        physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
        logicalChannels: [
          {
            id: 'feedback',
            physicalPointId: 'input-1',
            profile: 'generic-monitored-input',
            capabilities: ['input'],
            disconnectPolicy: { mode: 'hold' },
          },
          {
            id: 'load',
            physicalPointId: 'output-1',
            profile: 'pulsed-lock-bank',
            capabilities: ['output', 'pulse', 'feedback'],
            disconnectPolicy: { mode: 'immediate' },
            pulse: { durationMs: 5 },
            feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 15 },
          },
        ],
      };
      const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
      runtime = new WagoRuntime({
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        store,
        transport: transport,
        device: device,
      });
      await runtime.start();
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(monitored),
        snapshot: monitored,
      });
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered!: () => void;
      const shutdownSaving = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let completed!: () => void;
      const shutdownPublished = new Promise<void>((resolve) => {
        completed = resolve;
      });
      const persist = store.save.bind(store);
      jest.spyOn(store, 'save').mockImplementation(async (state) => {
        if (state.outputs.load === false) {
          entered();
          await held;
        }
        await persist(state);
      });
      const publish = transport.publish.bind(transport);
      jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
        await publish(topic, payload, options);
        if (topic.endsWith('/state')) {
          const report = payload as { outputs?: Record<string, boolean> };
          if (report.outputs?.load === false) completed();
        }
      });
      jest.useFakeTimers();
      try {
        await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
        await jest.advanceTimersByTimeAsync(5);
        await shutdownSaving;
        expect(device.values.get('751-9301:0')).toBe(false);
        const read = jest.spyOn(device, 'read');
        // The old ON deadline expires while the confirmed OFF is still waiting for disk.
        await jest.advanceTimersByTimeAsync(10);
        expect(read).not.toHaveBeenCalled();
        expect(transport.published).not.toContainEqual(
          expect.objectContaining({
            topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
            payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
          }),
        );
        device.values.set('751-9301:1', feedback);
        await jest.advanceTimersByTimeAsync(5);
        expect(read).toHaveBeenCalledWith(monitored.physicalPoints[1]);
        const faults = transport.published.filter((entry) => entry.topic.endsWith('/faults'));
        expect(faults).toEqual(
          feedback
            ? [
                expect.objectContaining({
                  payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
                }),
              ]
            : [],
        );
      } finally {
        release();
        await shutdownPublished;
        jest.useRealTimers();
      }
    },
  );
});

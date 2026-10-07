import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { TestTransport, snapshot, desired, commands, validCommand, createRuntimeFixture } from './runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it('cancels feedback checks superseded by a later output command', async () => {
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
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 15 },
        },
      ],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    // Disk and command acknowledgement latency must not advance the feedback deadline.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
      await transport.send(commands, validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }));
      const read = jest.spyOn(device, 'read');
      await jest.advanceTimersByTimeAsync(25);
      expect(read).toHaveBeenCalledWith(monitored.physicalPoints[1]);
      read.mockRestore();

      expect(transport.published).not.toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the prior feedback check when a replacement write fails', async () => {
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
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 10 },
        },
      ],
    };
    const failingDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (!value) throw new Error('temporary failure');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: failingDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    const outputs = runtime['outputs'];
    const verification = jest.spyOn(
      outputs as unknown as { verifyFeedback: (typeof outputs)['verifyFeedback'] },
      'verifyFeedback',
    );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
      await transport.send(commands, validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }));
      await jest.advanceTimersByTimeAsync(15);
      expect(verification).toHaveBeenCalledTimes(1);
      await verification.mock.results[0].value;

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
        }),
      );
    } finally {
      verification.mockRestore();
      jest.useRealTimers();
    }
  });

  it('keeps feedback verification for a successful write queued before a failed replacement', async () => {
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
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    let releaseFirstWrite!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const queuedFailureDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (value) {
          firstWriteStarted();
          await firstWrite;
        } else throw new Error('temporary failure');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: queuedFailureDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });

    const outputs = runtime['outputs'];
    const verification = jest.spyOn(
      outputs as unknown as { verifyFeedback: (typeof outputs)['verifyFeedback'] },
      'verifyFeedback',
    );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const first = transport.send(
        commands,
        validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
      );
      await started;
      const replacement = transport.send(
        commands,
        validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }),
      );
      releaseFirstWrite();
      await Promise.all([first, replacement]);
      await jest.advanceTimersByTimeAsync(10);
      expect(verification).toHaveBeenCalledTimes(1);
      await verification.mock.results[0].value;

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
        }),
      );
    } finally {
      verification.mockRestore();
      jest.useRealTimers();
    }
  });
});

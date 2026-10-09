import { MemoryDeviceAdapter } from '../../io/adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot, type Transport } from '../../runtime';
import {
  TestTransport,
  commands,
  createRuntimeFixture,
  desired,
  snapshot,
  validCommand,
} from '../../runtime.test-utils';

describe('WagoRuntime feedback verification', () => {
  let transport: TestTransport;

  let device: MemoryDeviceAdapter;

  let runtime: WagoRuntime;

  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });

  it('reports configured feedback mismatches after output writes', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-digital-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'feedback'],
          pulse: undefined,
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    await transport.send(commands, validCommand());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
      }),
    );
  });

  it('starts feedback verification before retained-state publication completes', async () => {
    jest.useFakeTimers();
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-digital-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          ...snapshot.logicalChannels[0],
          capabilities: ['output', 'feedback'],
          pulse: undefined,
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    let delayStatePublication = false;
    let releaseStatePublication!: () => void;
    let statePublicationStarted!: () => void;
    const statePublication = new Promise<void>((resolve) => {
      releaseStatePublication = resolve;
    });
    const startedStatePublication = new Promise<void>((resolve) => {
      statePublicationStarted = resolve;
    });
    const delayedTransport: Transport = {
      publish: async (topic, payload, options) => {
        if (delayStatePublication && topic.endsWith('/state')) {
          statePublicationStarted();
          await statePublication;
        }
        await transport.publish(topic, payload, options);
      },
      subscribe: async (topic, listener) => transport.subscribe(topic, listener),
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: delayedTransport,
      device: device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    delayStatePublication = true;

    try {
      const command = transport.send(commands, validCommand());
      await startedStatePublication;
      await jest.advanceTimersByTimeAsync(10);

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
        }),
      );
      releaseStatePublication();
      await command;
    } finally {
      releaseStatePublication();
      jest.useRealTimers();
    }
  });

  it('rejects numeric digital readback instead of publishing a false boolean', async () => {
    const numericFeedbackDevice = {
      write: async () => undefined,
      read: async () => 1,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
      device: numericFeedbackDevice,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));

    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          outputs: {},
          readiness: expect.objectContaining({ hardwareAvailable: false }),
        }),
      }),
    );
  });

  it('excludes feedback for outputs removed from the active configuration', async () => {
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
    const noOutputs: Snapshot = { ...snapshot, logicalChannels: [] };
    await transport.send(commands, validCommand({ id: 'off-before-removal', value: false }));
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(noOutputs),
      snapshot: noOutputs,
    });

    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ outputs: {} }),
      }),
    );
  });

  it('reports a feedback mismatch after the configured feedback timeout', async () => {
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
      await jest.advanceTimersByTimeAsync(10);
      expect(verification).toHaveBeenCalledTimes(1);
      await verification.mock.results[0].value;

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({
            channelId: 'load',
            code: 'feedback_mismatch',
            timestamp: expect.any(String),
            sequence: expect.any(Number),
          }),
        }),
      );
    } finally {
      verification.mockRestore();
      jest.useRealTimers();
    }
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
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
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
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
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

  it('does not publish a mismatch from a superseded in-flight feedback check', async () => {
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
    let delayNextRead = false;
    let resolveRead: ((value: boolean) => void) | undefined;
    let signalReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve;
    });
    const delayedReadDevice = {
      write: async () => undefined,
      read: async () => {
        if (!delayNextRead) return false;
        delayNextRead = false;
        signalReadStarted();
        return new Promise<boolean>((resolve) => {
          resolveRead = resolve;
        });
      },
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
      device: delayedReadDevice,
    });
    const outputs = runtime['outputs'];
    const verification = jest.spyOn(
      outputs as unknown as { verifyFeedback: (typeof outputs)['verifyFeedback'] },
      'verifyFeedback',
    );
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
      await runtime.pollInputs();
      delayNextRead = true;
      await jest.advanceTimersByTimeAsync(5);
      await readStarted;
      await transport.send(commands, validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }));
      expect(verification).toHaveBeenCalledTimes(1);
      const pendingVerification = verification.mock.results[0].value;
      resolveRead?.(false);
      // Includes any fault publication and its asynchronous state reservation.
      await pendingVerification;

      expect(transport.published).not.toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
        }),
      );
    } finally {
      resolveRead?.(false);
      verification.mockRestore();
      jest.useRealTimers();
    }
  });

  it('does not publish a fault from an in-flight feedback check after replacing configuration', async () => {
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
    let delayNextRead = false;
    let resolveRead: ((value: boolean) => void) | undefined;
    let signalReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve;
    });
    const delayedReadDevice = {
      write: async () => undefined,
      read: async () => {
        if (!delayNextRead) return false;
        delayNextRead = false;
        signalReadStarted();
        return new Promise<boolean>((resolve) => {
          resolveRead = resolve;
        });
      },
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
      device: delayedReadDevice,
    });
    const outputs = runtime['outputs'];
    const verification = jest.spyOn(
      outputs as unknown as { verifyFeedback: (typeof outputs)['verifyFeedback'] },
      'verifyFeedback',
    );
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
      await runtime.pollInputs();
      delayNextRead = true;
      await jest.advanceTimersByTimeAsync(5);
      await readStarted;
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(monitored),
        snapshot: monitored,
      });
      expect(verification).toHaveBeenCalledTimes(1);
      const pendingVerification = verification.mock.results[0].value;
      resolveRead?.(false);
      // Includes any fault publication and its asynchronous state reservation.
      await pendingVerification;

      expect(transport.published).not.toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load' }),
        }),
      );
    } finally {
      resolveRead?.(false);
      verification.mockRestore();
      jest.useRealTimers();
    }
  });

  it('cancels feedback from a write completed while configuration replacement waits', async () => {
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
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    const delayedWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const started = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const delayedWriteDevice = {
      write: async () => {
        writeStarted();
        await delayedWrite;
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: transport,
      device: delayedWriteDevice,
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
    let signalReplacementStarted!: () => void;
    const replacementStarted = new Promise<void>((resolve) => {
      signalReplacementStarted = resolve;
    });
    const replaceConfiguration = outputs.replaceConfiguration.bind(outputs);
    const replacing = jest.spyOn(outputs, 'replaceConfiguration').mockImplementation(<T>(commit: () => Promise<T>) => {
      const pending = replaceConfiguration(commit);
      signalReplacementStarted();
      return pending;
    });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const command = transport.send(
        commands,
        validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
      );
      await started;
      const replacement = transport.send(desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(monitored),
        snapshot: monitored,
      });
      await replacementStarted;
      releaseWrite();
      await Promise.all([command, replacement]);
      // Configuration replacement cancels the old deadline after draining the write.
      await jest.advanceTimersByTimeAsync(10);
      expect(verification).not.toHaveBeenCalled();
      expect(transport.published).not.toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load' }),
        }),
      );
    } finally {
      releaseWrite();
      replacing.mockRestore();
      verification.mockRestore();
      jest.useRealTimers();
    }
  });
});

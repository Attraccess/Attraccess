import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { TestTransport, snapshot, desired, commands, validCommand, createRuntimeFixture } from './runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, runtime } = await createRuntimeFixture());
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
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
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
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
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
});

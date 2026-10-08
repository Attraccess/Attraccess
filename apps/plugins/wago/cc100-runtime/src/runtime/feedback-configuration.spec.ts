import { JsonStateStore, WagoRuntime, hash, type Snapshot } from '../runtime';
import { TestTransport, snapshot, desired, commands, validCommand, createRuntimeFixture } from '../runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, runtime } = await createRuntimeFixture());
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
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
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

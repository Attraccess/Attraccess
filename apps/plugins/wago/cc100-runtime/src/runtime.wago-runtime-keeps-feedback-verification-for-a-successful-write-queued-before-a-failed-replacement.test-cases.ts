import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeKeepsFeedbackVerificationForASuccessfulWriteQueuedBeforeAFailedReplacement(
  scope: WagoRuntimeTestScope,
): void {
  it('keeps feedback verification for a successful write queued before a failed replacement', async () => {
    const monitored: Snapshot = {
      ...scope.snapshot,
      physicalPoints: [...scope.snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
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
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: scope.transport,
      device: queuedFailureDevice,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });

    const outputs = scope.runtime['outputs'];
    const verification = jest.spyOn(
      outputs as unknown as { verifyFeedback: (typeof outputs)['verifyFeedback'] },
      'verifyFeedback',
    );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const first = scope.transport.send(
        scope.commands,
        scope.validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
      );
      await started;
      const replacement = scope.transport.send(
        scope.commands,
        scope.validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }),
      );
      releaseFirstWrite();
      await Promise.all([first, replacement]);
      await jest.advanceTimersByTimeAsync(10);
      expect(verification).toHaveBeenCalledTimes(1);
      await verification.mock.results[0].value;

      expect(scope.transport.published).toContainEqual(
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
}

import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeKeepsThePriorFeedbackCheckWhenAReplacementWriteFails(
  scope: WagoRuntimeTestScope,
): void {
  it('keeps the prior feedback check when a replacement write fails', async () => {
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
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: scope.transport,
      device: failingDevice,
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
      await scope.transport.send(
        scope.commands,
        scope.validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
      );
      await scope.transport.send(
        scope.commands,
        scope.validCommand({ id: 'command-2', channelId: 'load', action: 'set', value: false }),
      );
      await jest.advanceTimersByTimeAsync(15);
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

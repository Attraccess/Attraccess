import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeReportsAFeedbackMismatchAfterTheConfiguredFeedbackTimeout(
  scope: WagoRuntimeTestScope,
): void {
  it('reports a feedback mismatch after the configured feedback timeout', async () => {
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
      await jest.advanceTimersByTimeAsync(10);
      expect(verification).toHaveBeenCalledTimes(1);
      await verification.mock.results[0].value;

      expect(scope.transport.published).toContainEqual(
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
}

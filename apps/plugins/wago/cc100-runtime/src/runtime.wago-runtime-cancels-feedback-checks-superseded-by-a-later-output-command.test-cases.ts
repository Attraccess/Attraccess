import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeCancelsFeedbackChecksSupersededByALaterOutputCommand(
  scope: WagoRuntimeTestScope,
): void {
  it('cancels feedback checks superseded by a later output command', async () => {
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
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 15 },
        },
      ],
    };
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    // Disk and command acknowledgement latency must not advance the feedback deadline.
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
      const read = jest.spyOn(scope.device, 'read');
      await jest.advanceTimersByTimeAsync(25);
      expect(read).toHaveBeenCalledWith(monitored.physicalPoints[1]);
      read.mockRestore();

      expect(scope.transport.published).not.toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
}

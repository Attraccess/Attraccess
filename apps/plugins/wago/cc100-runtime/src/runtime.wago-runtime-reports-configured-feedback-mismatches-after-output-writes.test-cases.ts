import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeReportsConfiguredFeedbackMismatchesAfterOutputWrites(
  scope: WagoRuntimeTestScope,
): void {
  it('reports configured feedback mismatches after output writes', async () => {
    const monitored: Snapshot = {
      ...scope.snapshot,
      physicalPoints: [...scope.snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-digital-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          ...scope.snapshot.logicalChannels[0],
          capabilities: ['output', 'feedback'],
          pulse: undefined,
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
    await scope.transport.send(scope.commands, scope.validCommand());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
      }),
    );
  });
}

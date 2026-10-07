import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsFeedbackThatReferencesTheOutputRatherThanAnInputChannel(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects feedback that references the output rather than an input channel', async () => {
    const invalid: Snapshot = {
      ...scope.snapshot,
      logicalChannels: [
        {
          ...scope.snapshot.logicalChannels[0],
          capabilities: ['output', 'pulse', 'feedback'],
          feedback: { channelId: 'load', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(invalid),
      snapshot: invalid,
    });

    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ path: 'snapshot.logicalChannels[0].feedback', code: 'invalid_feedback' }),
          ]),
        }),
      }),
    );
  });
}

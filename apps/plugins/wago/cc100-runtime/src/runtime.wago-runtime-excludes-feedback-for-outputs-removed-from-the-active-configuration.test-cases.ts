import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeExcludesFeedbackForOutputsRemovedFromTheActiveConfiguration(
  scope: WagoRuntimeTestScope,
): void {
  it('excludes feedback for outputs removed from the active configuration', async () => {
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    await scope.transport.send(
      scope.commands,
      scope.validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
    );
    const noOutputs: Snapshot = { ...scope.snapshot, logicalChannels: [] };
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'off-before-removal', value: false }));
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(noOutputs),
      snapshot: noOutputs,
    });

    expect(scope.transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ outputs: {} }),
      }),
    );
  });
}

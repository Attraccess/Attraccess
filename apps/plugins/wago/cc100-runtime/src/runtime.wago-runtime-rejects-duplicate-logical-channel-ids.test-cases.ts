import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsDuplicateLogicalChannelIds(scope: WagoRuntimeTestScope): void {
  it('rejects duplicate logical channel IDs', async () => {
    const duplicated = {
      ...scope.snapshot,
      logicalChannels: [...scope.snapshot.logicalChannels, { ...scope.snapshot.logicalChannels[0] }],
    };
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(duplicated),
      snapshot: duplicated,
    });
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ path: 'snapshot.logicalChannels[0].id' })]),
        }),
      }),
    );
  });
}

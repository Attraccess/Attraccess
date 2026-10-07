import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeAcceptsOpaqueServerDefinedProfileNames(scope: WagoRuntimeTestScope): void {
  it('accepts opaque server-defined profile names', async () => {
    const serverDefined = {
      ...scope.snapshot,
      logicalChannels: [{ ...scope.snapshot.logicalChannels[0], profile: 'server-defined-profile' }],
    };
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(serverDefined),
      snapshot: serverDefined,
    });

    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: { revision: 1, contentHash: hash(serverDefined), errors: [] },
        retain: true,
      }),
    );
  });
}

import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeAppliesACompleteValidRetainedSnapshotAndReportsItsRevision(
  scope: WagoRuntimeTestScope,
): void {
  it('applies a complete valid retained snapshot and reports its revision', async () => {
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: { revision: 1, contentHash: hash(scope.snapshot), errors: [] },
        retain: true,
      }),
    );
  });
}

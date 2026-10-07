import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsAnInvalidSnapshotWithoutReplacingTheLastValidConfiguration(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects an invalid snapshot without replacing the last valid configuration', async () => {
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: 'wrong',
      snapshot: { ...scope.snapshot, physicalPoints: [] },
    });
    await scope.transport.send(scope.commands, scope.validCommand());
    expect(scope.device.values.get('751-9301:0')).toBe(true);
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({ revision: 2, errors: expect.any(Array) }),
      }),
    );
  });
}

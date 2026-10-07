import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeReportsMalformedSnapshotCapabilitiesInsteadOfThrowing(
  scope: WagoRuntimeTestScope,
): void {
  it('reports malformed snapshot capabilities instead of throwing', async () => {
    const malformed = {
      ...scope.snapshot,
      logicalChannels: [{ ...scope.snapshot.logicalChannels[0], capabilities: undefined }],
    };
    await expect(
      scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(malformed),
        snapshot: malformed,
      }),
    ).resolves.toBeUndefined();
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ code: 'invalid_capabilities' })]),
        }),
      }),
    );
  });
}

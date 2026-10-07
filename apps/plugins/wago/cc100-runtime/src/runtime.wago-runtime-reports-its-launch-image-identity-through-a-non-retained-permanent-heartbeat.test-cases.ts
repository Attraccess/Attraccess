import { WagoRuntime } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeReportsItsLaunchImageIdentityThroughANonRetainedPermanentHeartbeat(
  scope: WagoRuntimeTestScope,
): void {
  it('reports its launch image identity through a non-retained permanent heartbeat', async () => {
    const runtimeImageId = `sha256:${'a'.repeat(64)}`;
    const identified = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      runtimeImageId,
      store: { load: async () => ({ outputs: {}, commandIds: [] }), save: async () => undefined },
      transport: scope.transport,
      device: scope.device,
    });
    await identified.start();
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/heartbeat',
        payload: expect.objectContaining({ runtimeImageId }),
        retain: undefined,
      }),
    );
  });
}

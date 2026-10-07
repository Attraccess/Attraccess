import { runtimeVersion } from '../manifest.json';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeIncludesThePairingCodeInTheBackendCompatibleHeartbeat(
  scope: WagoRuntimeTestScope,
): void {
  it('includes the pairing code in the backend-compatible heartbeat', async () => {
    await scope.runtime.publishHeartbeat();
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/heartbeat',
        payload: expect.objectContaining({
          hardwareId: 'cc100-1',
          pairingCode: '482931',
          protocolVersion: '1.0.0',
          runtimeVersion,
        }),
      }),
    );
  });
}

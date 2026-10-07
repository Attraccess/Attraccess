import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeAppliesConfigurationWhileAScheduledPulseShutdownKeepsRetrying(
  scope: WagoRuntimeTestScope,
): void {
  it('applies configuration while a scheduled pulse shutdown keeps retrying', async () => {
    const snapshot = scope.pulsedSnapshot;
    jest.useFakeTimers();
    let failShutdown = false;
    let shutdownAttempts = 0;
    const flakyDevice = {
      write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (failShutdown && !value) {
          shutdownAttempts += 1;
          throw new Error('relay write failed');
        }
        scope.device.values.set(`${point.hardwareProfile}:${point.channel}`, value);
      },
      read: async () => false,
    };
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: scope.transport,
      device: flakyDevice,
    });
    try {
      await scope.runtime.start();
      await scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(snapshot),
        snapshot,
      });
      await scope.transport.send(scope.commands, scope.validCommand({ action: 'pulse' }));
      failShutdown = true;

      await scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(snapshot),
        snapshot,
      });

      expect(scope.transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
          payload: expect.objectContaining({ revision: 2, errors: [] }),
        }),
      );
      expect(shutdownAttempts).toBe(0);
      await jest.advanceTimersByTimeAsync(3_110);
      expect(shutdownAttempts).toBe(6);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(shutdownAttempts).toBe(7);

      failShutdown = false;
      await scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 3,
        contentHash: hash(snapshot),
        snapshot,
      });

      expect(scope.device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(scope.device.values.get('751-9301:0')).toBe(false);
      expect(scope.transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
          payload: expect.objectContaining({ revision: 3, errors: [] }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
}

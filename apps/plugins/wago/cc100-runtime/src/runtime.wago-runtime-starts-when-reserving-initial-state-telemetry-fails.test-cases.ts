import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeStartsWhenReservingInitialStateTelemetryFails(scope: WagoRuntimeTestScope): void {
  it('starts when reserving initial state telemetry fails', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(scope.snapshot), snapshot: scope.snapshot },
      outputs: { load: true },
      commandIds: [],
    });
    const save = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: scope.transport,
      device: scope.device,
    });

    await expect(scope.runtime.start()).resolves.toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(scope.runtime.setConnected(false)).resolves.toBeUndefined();

    expect(save).toHaveBeenCalled();
    expect(scope.device.values.get('751-9301:0')).toBe(false);
  });
}

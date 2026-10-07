import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeReservesConcurrentCommandIdsBeforeDeviceWrites(scope: WagoRuntimeTestScope): void {
  it('reserves concurrent command IDs before device writes', async () => {
    const writes: boolean[] = [];
    const delayedDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
      read: async () => false,
    };
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: scope.transport,
      device: delayedDevice,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    await Promise.all([
      scope.transport.send(scope.commands, scope.validCommand()),
      scope.transport.send(scope.commands, scope.validCommand()),
    ]);
    expect(writes).toEqual([true]);
  });
}

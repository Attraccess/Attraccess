import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeSerializesCommandsForOneChannelInArrivalOrder(scope: WagoRuntimeTestScope): void {
  it('serializes commands for one channel in arrival order', async () => {
    const writes: boolean[] = [];
    let releaseFirst!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const delayedDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (writes.length === 1) {
          firstWriteStarted();
          await firstWrite;
        }
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

    const first = scope.transport.send(scope.commands, scope.validCommand({ id: 'first', value: true }));
    const second = scope.transport.send(scope.commands, scope.validCommand({ id: 'second', value: false }));
    await started;
    expect(writes).toEqual([true]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(writes).toEqual([true, false]);
  });
}

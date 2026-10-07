import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRetriesAFailedScheduledPulseShutdown(scope: WagoRuntimeTestScope): void {
  it('retries a failed scheduled pulse shutdown', async () => {
    const snapshot = scope.pulsedSnapshot;
    const writes: boolean[] = [];
    let shutdownCompleted: () => void = () => undefined;
    const shutdown = new Promise<void>((resolve) => {
      shutdownCompleted = resolve;
    });
    const flakyDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (!value && writes.filter((written) => !written).length === 1) throw new Error('temporary shutdown failure');
        if (!value) shutdownCompleted();
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
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });
    await scope.transport.send(scope.commands, scope.validCommand({ action: 'pulse' }));

    await shutdown;

    expect(writes).toEqual([true, false, false]);
  });
}

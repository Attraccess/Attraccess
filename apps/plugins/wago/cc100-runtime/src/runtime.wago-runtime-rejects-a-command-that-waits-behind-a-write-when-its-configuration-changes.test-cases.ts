import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsACommandThatWaitsBehindAWriteWhenItsConfigurationChanges(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects a command that waits behind a write when its configuration changes', async () => {
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

    const first = scope.transport.send(scope.commands, scope.validCommand({ id: 'first' }));
    const second = scope.transport.send(scope.commands, scope.validCommand({ id: 'second' }));
    await started;
    const replacement = scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    releaseFirst();
    await Promise.all([first, second, replacement]);

    expect(writes).toEqual([true]);
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'second', status: 'rejected', code: 'stale_revision' }),
      }),
    );
  });
}

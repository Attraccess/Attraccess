import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeSerializesDesiredConfigurationReplacementsInArrivalOrder(
  scope: WagoRuntimeTestScope,
): void {
  it('serializes desired configuration replacements in arrival order', async () => {
    let releaseShutdown!: () => void;
    let shutdownStarted!: () => void;
    const shutdown = new Promise<void>((resolve) => {
      releaseShutdown = resolve;
    });
    const started = new Promise<void>((resolve) => {
      shutdownStarted = resolve;
    });
    const delayedDevice = {
      write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (!value) {
          shutdownStarted();
          await shutdown;
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
      device: delayedDevice,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.pulsedSnapshot),
      snapshot: scope.pulsedSnapshot,
    });
    await scope.transport.send(scope.commands, scope.validCommand({ action: 'pulse' }));

    const revisionTwo = scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    await started;
    const revisionThree = scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 3,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    releaseShutdown();
    await Promise.all([revisionTwo, revisionThree]);

    await scope.transport.send(
      scope.commands,
      scope.validCommand({ id: 'revision-three', expectedConfigurationRevision: 3 }),
    );
    expect(scope.device.values.get('751-9301:0')).toBe(true);
  });
}

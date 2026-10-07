import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeShutsDownAPulseThatCompletesWhileConfigurationReplacementIsWaiting(
  scope: WagoRuntimeTestScope,
): void {
  it('shuts down a pulse that completes while configuration replacement is waiting', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const snapshot = scope.pulsedSnapshot;
      let releaseWrite!: () => void;
      let writeStarted!: () => void;
      const write = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const started = new Promise<void>((resolve) => {
        writeStarted = resolve;
      });
      const delayedDevice = {
        write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
          if (value) {
            writeStarted();
            await write;
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
        contentHash: hash(snapshot),
        snapshot,
      });

      const pulse = scope.transport.send(scope.commands, scope.validCommand({ action: 'pulse' }));
      await started;
      const replacement = scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(snapshot),
        snapshot,
      });
      releaseWrite();
      await Promise.all([pulse, replacement]);

      expect(scope.device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(20);
      expect(scope.device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
}

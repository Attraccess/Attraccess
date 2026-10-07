import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeDoesNotLetAStalePulseShutoffOverrideASetCommandAfterChangingToSwitchedBehavior(
  scope: WagoRuntimeTestScope,
): void {
  it('does not let a stale pulse shutoff override a set command after changing to switched behavior', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      let resolvePulseWrite: (() => void) | undefined;
      let notifyPulseWriteStarted: (() => void) | undefined;
      const pulseWriteStarted = new Promise<void>((resolve) => {
        notifyPulseWriteStarted = resolve;
      });
      const writes: boolean[] = [];
      const delayedPulseDevice = {
        write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
          writes.push(value);
          if (writes.length === 1) {
            notifyPulseWriteStarted?.();
            await new Promise<void>((resolve) => {
              resolvePulseWrite = resolve;
            });
          }
        },
        read: async () => false,
      };
      scope.runtime = new WagoRuntime({
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
        transport: scope.transport,
        device: delayedPulseDevice,
      });
      await scope.runtime.start();
      await scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(scope.pulsedSnapshot),
        snapshot: scope.pulsedSnapshot,
      });

      const pulse = scope.transport.send(
        scope.commands,
        scope.validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }),
      );
      await pulseWriteStarted;
      const replacement = scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(scope.snapshot),
        snapshot: scope.snapshot,
      });
      resolvePulseWrite?.();
      await Promise.all([pulse, replacement]);
      await scope.transport.send(
        scope.commands,
        scope.validCommand({ id: 'command-2', expectedConfigurationRevision: 2 }),
      );
      await jest.advanceTimersByTimeAsync(20);

      expect(writes).toEqual([true, true]);
    } finally {
      jest.useRealTimers();
    }
  });
}

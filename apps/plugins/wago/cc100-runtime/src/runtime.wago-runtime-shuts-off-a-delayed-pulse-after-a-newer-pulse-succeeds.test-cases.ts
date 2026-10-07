import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeShutsOffADelayedPulseAfterANewerPulseSucceeds(scope: WagoRuntimeTestScope): void {
  it('shuts off a delayed pulse after a newer pulse succeeds', async () => {
    // A generous pulse duration keeps the repeated pulse's registration safely ahead of the
    // first shutoff timer on loaded runners; the property under test is the cancellation of
    // the superseded shutoff, not the timer granularity.
    const snapshot: Snapshot = {
      ...scope.pulsedSnapshot,
      logicalChannels: [{ ...scope.pulsedSnapshot.logicalChannels[0], pulse: { durationMs: 250 } }],
    };
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
      contentHash: hash(snapshot),
      snapshot,
    });

    const pulse = scope.transport.send(
      scope.commands,
      scope.validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }),
    );
    await pulseWriteStarted;
    const repeatedPulse = scope.transport.send(
      scope.commands,
      scope.validCommand({ id: 'command-2', channelId: 'load', action: 'pulse' }),
    );
    resolvePulseWrite?.();
    await pulse;
    await repeatedPulse;
    expect(writes).toEqual([true, true]);

    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && writes.length < 3) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(writes).toEqual([true, true, false]);
  }, 15000);
}

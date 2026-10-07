import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeShutsOffAnAcceptedPulseAfterANewerPulseFails(scope: WagoRuntimeTestScope): void {
  it('shuts off an accepted pulse after a newer pulse fails', async () => {
    const snapshot = scope.pulsedSnapshot;
    const pulseSnapshot: Snapshot = {
      ...snapshot,
      logicalChannels: snapshot.logicalChannels.map((channel) => ({
        ...channel,
        pulse: { durationMs: 100 },
      })),
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
        } else if (value) throw new Error('temporary failure');
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
      contentHash: hash(pulseSnapshot),
      snapshot: pulseSnapshot,
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
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'accepted', error: undefined }),
      }),
    );
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-2', status: 'rejected', error: 'device write failed' }),
      }),
    );
    expect(writes).toEqual([true, true, false]);
  });
}

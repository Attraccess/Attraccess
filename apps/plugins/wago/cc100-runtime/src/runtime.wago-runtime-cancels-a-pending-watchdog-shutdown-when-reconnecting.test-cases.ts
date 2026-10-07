import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeCancelsAPendingWatchdogShutdownWhenReconnecting(scope: WagoRuntimeTestScope): void {
  it('cancels a pending watchdog shutdown when reconnecting', async () => {
    jest.useFakeTimers();
    try {
      const watchdogSnapshot: Snapshot = {
        ...scope.snapshot,
        logicalChannels: [
          { ...scope.snapshot.logicalChannels[0], disconnectPolicy: { mode: 'watchdog', timeoutMs: 100 } },
        ],
      };
      await scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(watchdogSnapshot),
        snapshot: watchdogSnapshot,
      });
      await scope.transport.send(
        scope.commands,
        scope.validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }),
      );

      await scope.runtime.setConnected(false);
      await scope.runtime.setConnected(true);
      await jest.advanceTimersByTimeAsync(100);

      expect(scope.device.values.get('751-9301:0')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
}

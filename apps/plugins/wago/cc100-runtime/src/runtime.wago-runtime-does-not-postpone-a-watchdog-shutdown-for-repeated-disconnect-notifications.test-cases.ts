import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeDoesNotPostponeAWatchdogShutdownForRepeatedDisconnectNotifications(
  scope: WagoRuntimeTestScope,
): void {
  it('does not postpone a watchdog shutdown for repeated disconnect notifications', async () => {
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
      await jest.advanceTimersByTimeAsync(90);
      await scope.runtime.setConnected(false);
      await jest.advanceTimersByTimeAsync(10);

      expect(scope.device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
}

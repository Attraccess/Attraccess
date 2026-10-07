import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeKeepsActivePulsesUntilTheirDeadlineAfterApplyingAReplacementConfiguration(
  scope: WagoRuntimeTestScope,
): void {
  it('keeps active pulses until their deadline after applying a replacement configuration', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const snapshot = scope.pulsedSnapshot;
      const replacement: Snapshot = {
        ...snapshot,
        physicalPoints: [{ id: 'output-2', hardwareProfile: '751-9301', channel: 1 }],
        logicalChannels: [{ ...snapshot.logicalChannels[0], physicalPointId: 'output-2' }],
      };
      await scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(snapshot),
        snapshot,
      });
      await scope.transport.send(scope.commands, scope.validCommand({ action: 'pulse' }));

      await scope.transport.send(scope.desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(replacement),
        snapshot: replacement,
      });

      await jest.advanceTimersByTimeAsync(9);
      expect(scope.device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(1);
      expect(scope.device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
}

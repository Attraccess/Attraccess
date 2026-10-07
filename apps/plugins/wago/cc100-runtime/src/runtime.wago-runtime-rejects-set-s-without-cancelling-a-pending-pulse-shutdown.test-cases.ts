import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsSetSWithoutCancellingAPendingPulseShutdown(
  scope: WagoRuntimeTestScope,
): void {
  it.each([true, false])('rejects set %s without cancelling a pending pulse shutdown', async (value) => {
    const snapshot = scope.pulsedSnapshot;
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot,
    });

    await scope.transport.send(scope.commands, scope.validCommand({ id: 'pulse', action: 'pulse' }));
    await scope.transport.send(scope.commands, scope.validCommand({ id: 'set', value }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'set', status: 'rejected', code: 'unsupported_operation' }),
      }),
    );
    expect(scope.device.values.get('751-9301:0')).toBe(false);
  });
}

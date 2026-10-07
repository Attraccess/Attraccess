import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeAcknowledgesDuplicateCommandsAndEnforcesImmediateDisconnectPolicy(
  scope: WagoRuntimeTestScope,
): void {
  it('acknowledges duplicate commands and enforces immediate disconnect policy', async () => {
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
    await scope.transport.send(scope.commands, scope.validCommand());
    await scope.transport.send(scope.commands, scope.validCommand({ value: false }));
    await scope.runtime.setConnected(false);
    expect(scope.device.values.get('751-9301:0')).toBe(false);
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'duplicate', error: undefined }),
      }),
    );
  });
}

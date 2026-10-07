import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsStaleConfigurationRevisionsBeforeWritingTheDevice(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects stale configuration revisions before writing the device', async () => {
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });

    await scope.transport.send(
      scope.commands,
      scope.validCommand({
        id: 'stale-command',
        expiresAt: '2099-01-01T00:00:00.000Z',
        channelId: 'load',
        action: 'set',
        value: true,
        expectedConfigurationRevision: 1,
      }),
    );

    expect(scope.device.values.get('751-9301:0')).toBeUndefined();
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'stale-command', status: 'rejected', code: 'stale_revision' }),
      }),
    );
  });
}

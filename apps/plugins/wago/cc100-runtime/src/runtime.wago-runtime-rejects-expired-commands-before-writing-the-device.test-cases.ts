import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsExpiredCommandsBeforeWritingTheDevice(scope: WagoRuntimeTestScope): void {
  it('rejects expired commands before writing the device', async () => {
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });

    await scope.transport.send(
      scope.commands,
      scope.validCommand({
        id: 'expired-command',
        expiresAt: '2000-01-01T00:00:00.000Z',
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
        payload: expect.objectContaining({ id: 'expired-command', status: 'rejected', code: 'expired' }),
      }),
    );
  });
}

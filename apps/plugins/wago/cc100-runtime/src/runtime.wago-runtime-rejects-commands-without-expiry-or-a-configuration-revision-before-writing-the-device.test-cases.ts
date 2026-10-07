import { hash } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsCommandsWithoutExpiryOrAConfigurationRevisionBeforeWritingTheDevice(
  scope: WagoRuntimeTestScope,
): void {
  it('rejects commands without expiry or a configuration revision before writing the device', async () => {
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });

    await scope.transport.send(scope.commands, scope.validCommand({ id: 'missing-expiry', expiresAt: undefined }));
    await scope.transport.send(
      scope.commands,
      scope.validCommand({ id: 'missing-revision', expectedConfigurationRevision: undefined }),
    );

    expect(scope.device.values.get('751-9301:0')).toBeUndefined();
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'missing-expiry', status: 'rejected', code: 'expired' }),
      }),
    );
    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'missing-revision', status: 'rejected', code: 'invalid_command' }),
      }),
    );
  });
}

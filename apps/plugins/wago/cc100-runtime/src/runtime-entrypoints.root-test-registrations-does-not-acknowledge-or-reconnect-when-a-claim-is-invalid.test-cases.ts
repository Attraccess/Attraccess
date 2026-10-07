import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsDoesNotAcknowledgeOrReconnectWhenAClaimIsInvalid(
  scope: RootTestRegistrationsTestScope,
): void {
  test('does not acknowledge or reconnect when a claim is invalid', async () => {
    await scope.boot();
    scope.mockClients[0].emit('connect');
    await scope.flush();
    scope.mockClients[0].emit(
      'message',
      'attraccess/wago/discovery/test-device/claim',
      Buffer.from('{"username":"missing-password"}'),
    );
    await scope.flush();
    expect(scope.mockClients).toHaveLength(1);
    expect(scope.mockState.credentials).toBeUndefined();
    expect(scope.mockClients[0].end).not.toHaveBeenCalled();
  });
}

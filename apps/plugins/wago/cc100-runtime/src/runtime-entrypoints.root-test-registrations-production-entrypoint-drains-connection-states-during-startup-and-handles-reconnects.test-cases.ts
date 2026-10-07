import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsProductionEntrypointDrainsConnectionStatesDuringStartupAndHandlesReconnects(
  scope: RootTestRegistrationsTestScope,
): void {
  test('production entrypoint drains connection states during startup and handles reconnects', async () => {
    process.env.WAGO_HARDWARE_PROFILE = 'cc100-751-9301-fw31-digital-v1';
    delete process.env.WAGO_IO_PATHS;
    delete process.env.WAGO_MQTT_USE_ENV_CREDENTIALS;
    scope.mockState = { credentials: { username: 'permanent', password: 'persisted' } };
    await import('./main');
    await scope.flush();
    const client = scope.mockClients[0];
    client.emit('connect');
    client.emit('close');
    await scope.flush();
    expect(scope.mockRuntime.start).toHaveBeenCalledTimes(1);
    expect(scope.mockRuntime.setConnected.mock.calls).toEqual([[true], [false]]);
    client.emit('connect');
    await scope.flush();
    expect(scope.mockRuntime.retryCredentialRotationSubscription).toHaveBeenCalled();
    expect(scope.mockRuntime.setConnected).toHaveBeenLastCalledWith(true);
    expect(scope.mockRuntime.acknowledgeCredentialRotation).toHaveBeenCalledWith(scope.mockState.credentials);
  });
}

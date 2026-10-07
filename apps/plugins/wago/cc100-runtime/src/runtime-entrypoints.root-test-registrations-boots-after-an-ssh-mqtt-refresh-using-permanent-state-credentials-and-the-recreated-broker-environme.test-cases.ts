import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsBootsAfterAnSshMqttRefreshUsingPermanentStateCredentialsAndTheRecreatedBrokerEnvironme(
  scope: RootTestRegistrationsTestScope,
): void {
  test('boots after an SSH MQTT refresh using permanent state credentials and the recreated broker environment', async () => {
    process.env.WAGO_HARDWARE_PROFILE = 'cc100-751-9301-fw31-digital-v1';
    delete process.env.WAGO_IO_PATHS;
    process.env.WAGO_MQTT_URL = 'mqtts://new-broker.test:8883';
    process.env.WAGO_MQTT_USE_ENV_CREDENTIALS = 'false';
    process.env.WAGO_MQTT_USERNAME = 'old-environment-username';
    process.env.WAGO_MQTT_PASSWORD = 'old-environment-password';
    scope.mockState = {
      credentials: {
        username: 'wago-controller-test-device',
        password: 'refreshed-device-password',
        prefix: 'attraccess/wago',
        credentialEpoch: '22222222-2222-4222-8222-222222222222',
      },
      credentialRotation: { revision: 1, token: 'fresh-ssh-operation-token' },
    };
    await import('./main');
    await scope.flush();
    const { connect } = await import('mqtt');
    expect(connect).toHaveBeenCalledWith(
      'mqtts://new-broker.test:8883',
      expect.objectContaining({
        username: 'wago-controller-test-device',
        password: 'refreshed-device-password',
      }),
    );
    scope.mockClients[0].emit('connect');
    await scope.flush();
    expect(scope.mockRuntime.acknowledgeCredentialRotation).toHaveBeenCalledWith(scope.mockState.credentials);
  });
}

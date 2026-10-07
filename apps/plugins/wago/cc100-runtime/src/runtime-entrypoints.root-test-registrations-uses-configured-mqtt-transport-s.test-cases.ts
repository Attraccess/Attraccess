import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsUsesConfiguredMqttTransportS(scope: RootTestRegistrationsTestScope): void {
  test.each([
    ['mqtt://broker.test', undefined, undefined, {}],
    ['mqtts://broker.test', 'true', 'broker.internal', { rejectUnauthorized: false, servername: 'broker.internal' }],
  ])('uses configured MQTT transport %s', async (url, insecure, servername, options) => {
    process.env.WAGO_MQTT_URL = url;
    process.env.WAGO_MQTT_USERNAME = 'enrollment';
    process.env.WAGO_MQTT_PASSWORD = 'fixture-only';
    process.env.WAGO_HARDWARE_PROFILE = 'cc100-751-9301-fw31-digital-v1';
    if (insecure) process.env.WAGO_MQTT_TLS_INSECURE = insecure;
    if (servername) process.env.WAGO_MQTT_TLS_SERVERNAME = servername;
    await import('./main');
    await scope.flush();
    const { connect } = await import('mqtt');
    expect(connect).toHaveBeenCalledWith(url, expect.objectContaining(options));
    if (url.startsWith('mqtt://')) {
      expect(jest.mocked(connect).mock.calls[0][1]).not.toHaveProperty('rejectUnauthorized');
      expect(jest.mocked(connect).mock.calls[0][1]).not.toHaveProperty('servername');
    }
  });
}

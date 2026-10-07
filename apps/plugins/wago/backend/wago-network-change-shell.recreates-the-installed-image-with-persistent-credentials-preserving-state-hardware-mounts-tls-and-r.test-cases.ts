import type { FixedMqttRecreationProgramAndDurableStateTestScope } from "./wago-network-change-shell.spec";
export function registerRecreatesTheInstalledImageWithPersistentCredentialsPreservingStateHardwareMountsTlsAndR(scope: FixedMqttRecreationProgramAndDurableStateTestScope): void {
it('recreates the installed image with persistent credentials, preserving state, hardware, mounts, TLS and required environment', async () => {
    await scope.run();
    const saved = JSON.parse(scope.fixture.read('var/lib/attraccess-wago/state.json'));
    expect(saved).toEqual({
      ...scope.state,
      credentials: { ...scope.state.credentials, password: scope.payload.password, credentialEpoch: scope.payload.credentialEpoch },
      credentialRotation: { revision: 1, token: scope.payload.token },
    });
    const spec = scope.created as {
      Image: string;
      Env: string[];
      HostConfig: Record<string, unknown>;
      Cmd: string[];
      Labels: Record<string, string>;
    };
    expect(spec.Image).toBe(scope.image);
    expect(spec.Cmd).toEqual(['node', 'main.cjs']);
    expect(spec.Labels).toMatchObject({
      installed: 'original',
      'io.attraccess.wago.network-token': scope.payload.operationToken,
    });
    expect(spec.HostConfig).toEqual({
      ...(scope.original.HostConfig as object),
      Binds: [
        '/var/lib/attraccess-wago:/var/lib/attraccess-wago',
        '/custom/cert:/custom/cert:ro',
        '/etc/attraccess-wago/runtime-ca.pem:/var/lib/attraccess-wago/mqtt-ca.pem:ro',
      ],
    });
    expect(spec.Env).toEqual(
      expect.arrayContaining([
        'WAGO_ENROLLMENT_SECRET=preserved-secret',
        'WAGO_PAIRING_CODE=123456',
        'EXTRA=keep-me',
        `WAGO_MQTT_URL=${scope.payload.url}`,
        `WAGO_MQTT_PASSWORD=${scope.payload.password}`,
        'WAGO_MQTT_TLS_SERVERNAME=broker.internal',
        'WAGO_MQTT_USE_ENV_CREDENTIALS=false',
      ]),
    );
    expect(scope.fixture.read('etc/attraccess-wago/runtime.env')).toContain(`WAGO_MQTT_URL=${scope.payload.url}\n`);
    expect(scope.fixture.read('etc/attraccess-wago/runtime-ca.pem')).toBe(scope.payload.caCert);
    expect(scope.requests.map((request) => request.split(' ')[0])).toEqual(['GET', 'DELETE', 'POST']);
    // A reboot/recreation reads permanent credentials from this same persisted
    // state rather than reverting to the earlier environment's enrollment login.
    await scope.run();
    expect(scope.requests.filter((request) => request.startsWith('POST'))).toHaveLength(1);
    const rebooted = JSON.parse(scope.fixture.read('var/lib/attraccess-wago/state.json'));
    expect(rebooted.credentials).toEqual({
      ...scope.state.credentials,
      password: scope.payload.password,
      credentialEpoch: scope.payload.credentialEpoch,
    });
    expect(rebooted.accepted).toEqual(scope.state.accepted);
  });
}

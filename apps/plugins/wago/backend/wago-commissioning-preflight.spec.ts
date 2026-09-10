import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { assertCommissioningBroker, controllerPreparationBlockers } from './wago-commissioning-preflight';
import type { WagoCommissioningPreflightReport } from '../shared/commissioning';

describe('automatic controller prerequisite admission', () => {
  const supported: WagoCommissioningPreflightReport = {
    platform: 'supported', hardware: 'accessible', exclusivity: 'clear', docker: 'running',
    configDocker: 'present', provision: 'prepare-controller',
  };
  it.each(['codesys-active', 'codesys-boot-enabled'] as const)('allows preparation to resolve %s and register permissions', (exclusivity) => {
    expect(controllerPreparationBlockers({ ...supported, exclusivity, hardware: 'uid10001-access-denied' })).toEqual([]);
  });
  it('allows the firmware-installed Docker service to be activated automatically', () => {
    expect(controllerPreparationBlockers({ ...supported, docker: 'installed-stopped', provision: 'install-vendor-runtime' })).toEqual([]);
  });
});

describe('commissioning broker preflight', () => {
  const config: MqttServerConnectionConfig = {
    id: 1,
    name: 'Isolated fixture',
    host: 'broker.example.test',
    port: 8883,
    useTls: true,
    username: null,
    password: null,
    clientId: null,
  };

  it('accepts the MQTT TLS settings selected by the user without connecting to a broker', () => {
    expect(() => assertCommissioningBroker(config)).not.toThrow();
    expect(() =>
      assertCommissioningBroker({
        ...config,
        useTls: false,
        tlsInsecure: true,
        tlsServername: 'other.example.test',
        caCert: 'user-managed-certificate-data',
      }),
    ).not.toThrow();
  });

  it.each(['broker.example.test/path', 'broker.example.test\nWAGO_MQTT_PASSWORD=bad', 'user@broker.example.test'])(
    'rejects malformed hosts',
    (host) => {
      expect(() => assertCommissioningBroker({ ...config, host })).toThrow('hostname');
    },
  );
});

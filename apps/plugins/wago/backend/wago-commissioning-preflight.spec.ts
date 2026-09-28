import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { assertCommissioningBroker } from './wago-commissioning-preflight';
import { rootCertificates } from 'node:tls';
import { X509Certificate } from 'node:crypto';

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

  it('accepts system trust without connecting to a broker', () => {
    expect(() => assertCommissioningBroker(config)).not.toThrow();
  });

  it.each([{ useTls: false, port: 1883 }, { tlsInsecure: true }])('accepts the selected transport %j', (override) => {
    expect(() => assertCommissioningBroker({ ...config, ...override })).not.toThrow();
  });

  it('does not require a CA for TLS configured without certificate verification', () => {
    expect(() => assertCommissioningBroker({ ...config, tlsInsecure: true, caCert: 'unused' })).not.toThrow();
  });

  it('uses the configured TLS hostname override', () => {
    expect(() => assertCommissioningBroker({ ...config, tlsServername: 'other.example.test' })).not.toThrow();
  });

  it.each(['bad pem', '-----BEGIN CERTIFICATE-----\nbad\n-----END CERTIFICATE-----'])(
    'rejects invalid CA input',
    (caCert) => {
      expect(() => assertCommissioningBroker({ ...config, caCert })).toThrow('CA');
    },
  );

  it('validates a PEM trust anchor and reports certificate clock errors', () => {
    const caCert = rootCertificates[0];
    const certificate = new X509Certificate(caCert);
    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);
    expect(() => assertCommissioningBroker({ ...config, caCert }, (validFrom + validTo) / 2)).not.toThrow();
    expect(() => assertCommissioningBroker({ ...config, caCert }, validFrom - 1)).toThrow('clock');
    expect(() => assertCommissioningBroker({ ...config, caCert }, validTo + 1)).toThrow('expired');
    expect(() =>
      assertCommissioningBroker({ ...config, caCert: `${caCert}\nprivate-key-material` }, validFrom),
    ).toThrow('PEM');
  });

  it.each(['broker.example.test/path', 'broker.example.test\nWAGO_MQTT_PASSWORD=bad', 'user@broker.example.test'])(
    'rejects malformed hosts',
    (host) => {
      expect(() => assertCommissioningBroker({ ...config, host })).toThrow('hostname');
    },
  );
});

import { ConflictException } from '@nestjs/common';
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { X509Certificate } from 'node:crypto';

/** Validate local configuration before SSH or broker credential provisioning. */
export function assertCommissioningBroker(config: MqttServerConnectionConfig, now = Date.now()): void {
  if (!config.useTls || config.tlsInsecure)
    throw new ConflictException('CC100 commissioning requires MQTT TLS with certificate verification enabled.');
  if (!/^[a-zA-Z0-9.-]+$/.test(config.host) || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new ConflictException('Configure a valid MQTT hostname and port before commissioning.');
  // The current runtime authenticates the URL hostname; do not silently ignore an override.
  if (config.tlsServername && config.tlsServername !== config.host)
    throw new ConflictException('Use the MQTT certificate DNS name as the broker host before commissioning.');
  if (config.caCert == null) return;
  const certificates = config.caCert.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (
    !certificates?.length ||
    config.caCert.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()
  )
    throw new ConflictException('The MQTT private CA must contain PEM certificates only.');
  for (const pem of certificates) {
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(pem);
    } catch {
      throw new ConflictException('The MQTT private CA certificate is invalid. Import a valid PEM CA certificate.');
    }
    if (!certificate.ca)
      throw new ConflictException('The MQTT trust bundle must contain CA certificates, not server certificates.');
    if (now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo))
      throw new ConflictException(
        'The MQTT CA certificate is expired or not yet valid. Check the server clock and renew the CA.',
      );
  }
}

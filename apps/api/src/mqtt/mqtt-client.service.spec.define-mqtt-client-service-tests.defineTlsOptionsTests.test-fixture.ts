import * as mqtt from 'mqtt';
import { Logger } from '@nestjs/common';
import { registerTlsOptionsPassesCaCertServernameAndRejectUnauthorizedFalseWhenTlsTrustOptionsAreSet } from './mqtt-client.service.tls-options-passes-ca-cert-servername-and-reject-unauthorized-false-when-tls-trust-options-are-set.test-cases';
import { registerTlsOptionsKeepsDefaultCertificateVerificationWhenTlsTrustOptionsAreUnset } from './mqtt-client.service.tls-options-keeps-default-certificate-verification-when-tls-trust-options-are-unset.test-cases';
import { registerTlsOptionsIgnoresTlsTrustOptionsWhenTlsIsDisabled } from './mqtt-client.service.tls-options-ignores-tls-trust-options-when-tls-is-disabled.test-cases';
import { MqttClientServicePrivate } from './mqtt-client.service.spec.mqtt-client-service-private';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { MqttClientServiceTestScope } from './mqtt-client.service.spec.define-mqtt-client-service-tests';

export function defineTlsOptionsTests(parentScope: MqttClientServiceTestScope) {
  // Restores the real getOrCreateClient so createClient actually builds mqtt.connect options.
  const scope = inheritTestScope(
    {
      get connectWith() {
        return connectWith;
      },
    },
    parentScope,
  );
  const connectWith = async (serverOverrides: Partial<typeof parentScope.mockServer> & Record<string, unknown>) => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());
    (parentScope.mockRepository.findOneBy as jest.Mock).mockResolvedValue({
      ...parentScope.mockServer,
      ...serverOverrides,
    });

    await (parentScope.service as unknown as MqttClientServicePrivate).getOrCreateClient(1);

    const connectMock = mqtt.connect as jest.Mock;
    return {
      url: connectMock.mock.calls.at(-1)?.[0] as string,
      options: connectMock.mock.calls.at(-1)?.[1] as mqtt.IClientOptions,
    };
  };

  registerTlsOptionsPassesCaCertServernameAndRejectUnauthorizedFalseWhenTlsTrustOptionsAreSet(scope);

  registerTlsOptionsKeepsDefaultCertificateVerificationWhenTlsTrustOptionsAreUnset(scope);

  registerTlsOptionsIgnoresTlsTrustOptionsWhenTlsIsDisabled(scope);

  return scope;
}

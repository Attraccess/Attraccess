import type { MqttCredentialRequest } from '@attraccess/plugins-backend-sdk';
import type { ProvisionedMqttCredential } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderSupportsOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-supports-operation';

export abstract class RabbitmqCredentialProvisioningProviderProvisionOperation extends RabbitmqCredentialProvisioningProviderSupportsOperation {
  provision(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential> {
    return this.writeCredential(request);
  }
}

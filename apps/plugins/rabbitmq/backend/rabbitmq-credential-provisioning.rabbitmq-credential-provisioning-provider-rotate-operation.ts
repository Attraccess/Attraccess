import type { MqttCredentialRequest } from '@attraccess/plugins-backend-sdk';
import type { ProvisionedMqttCredential } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderProvisionOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-provision-operation';

export abstract class RabbitmqCredentialProvisioningProviderRotateOperation extends RabbitmqCredentialProvisioningProviderProvisionOperation {
  rotate(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential> {
    return this.writeCredential(request);
  }
}

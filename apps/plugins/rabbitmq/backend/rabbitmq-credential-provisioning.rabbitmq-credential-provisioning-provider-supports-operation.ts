import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderState } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-state';

export abstract class RabbitmqCredentialProvisioningProviderSupportsOperation extends RabbitmqCredentialProvisioningProviderState {
  async supports(config: MqttServerConnectionConfig): Promise<boolean> {
    return (await this.detection.detect(config.id)).isRabbitMQ;
  }
}

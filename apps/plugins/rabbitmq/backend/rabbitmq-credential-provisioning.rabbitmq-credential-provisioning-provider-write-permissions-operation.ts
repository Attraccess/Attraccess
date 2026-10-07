import type { MqttCredentialRequest } from '@attraccess/plugins-backend-sdk';
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { mqttFiltersToRegex } from './rabbitmq-credential-provisioning.helpers';
import { escapeRegex } from './rabbitmq-credential-provisioning.helpers';
import { RabbitmqCredentialProvisioningProviderWriteCredentialLockedOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-write-credential-locked-operation';

export abstract class RabbitmqCredentialProvisioningProviderWritePermissionsOperation extends RabbitmqCredentialProvisioningProviderWriteCredentialLockedOperation {
  protected async writePermissions(
    config: MqttServerConnectionConfig,
    request: MqttCredentialRequest,
    vhost: string,
    username: string,
  ): Promise<void> {
    const subscriptionQueue = `mqtt-subscription-${escapeRegex(request.identity)}.*`;
    await this.client.request(config, 'PUT', `/permissions/${vhost}/${username}`, {
      configure: `^${subscriptionQueue}$`,
      write: `^(amq\\.topic|${subscriptionQueue})$`,
      read: `^(amq\\.topic|${subscriptionQueue})$`,
    });
    await this.client.request(config, 'PUT', `/topic-permissions/${vhost}/${username}`, {
      exchange: 'amq.topic',
      write: mqttFiltersToRegex(request.topicPolicy.publish),
      read: mqttFiltersToRegex(request.topicPolicy.subscribe),
    });
  }
}

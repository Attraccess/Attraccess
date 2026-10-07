import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqTopicPermissions } from './rabbitmq-credential-provisioning.contracts';
import { RabbitmqCredentialProvisioningProviderGetPermissionsOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-get-permissions-operation';

export abstract class RabbitmqCredentialProvisioningProviderGetTopicPermissionsOperation extends RabbitmqCredentialProvisioningProviderGetPermissionsOperation {
  protected async getTopicPermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
  ): Promise<RabbitmqTopicPermissions | null> {
    return this.getOptional(config, `/topic-permissions/${vhost}/${username}`);
  }
}

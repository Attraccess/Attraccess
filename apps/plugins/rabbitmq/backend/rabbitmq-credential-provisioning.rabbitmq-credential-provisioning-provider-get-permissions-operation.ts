import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqPermissions } from './rabbitmq-credential-provisioning.contracts';
import { RabbitmqCredentialProvisioningProviderExistsOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-exists-operation';

export abstract class RabbitmqCredentialProvisioningProviderGetPermissionsOperation extends RabbitmqCredentialProvisioningProviderExistsOperation {
  protected async getPermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
  ): Promise<RabbitmqPermissions | null> {
    return this.getOptional(config, `/permissions/${vhost}/${username}`);
  }
}

import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderWritePermissionsOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-write-permissions-operation';

export abstract class RabbitmqCredentialProvisioningProviderUserExistsOperation extends RabbitmqCredentialProvisioningProviderWritePermissionsOperation {
  protected async userExists(config: MqttServerConnectionConfig, username: string): Promise<boolean> {
    return this.exists(config, `/users/${username}`);
  }
}

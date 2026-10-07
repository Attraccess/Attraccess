import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqPermissions } from './rabbitmq-credential-provisioning.contracts';
import { RabbitmqTopicPermissions } from './rabbitmq-credential-provisioning.contracts';
import { RabbitmqCredentialProvisioningProviderGetOptionalOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-get-optional-operation';

export abstract class RabbitmqCredentialProvisioningProviderRestorePermissionsOperation extends RabbitmqCredentialProvisioningProviderGetOptionalOperation {
  protected async restorePermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
    permissions: RabbitmqPermissions | null,
    topicPermissions: RabbitmqTopicPermissions | null,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.restorePermission(config, `/permissions/${vhost}/${username}`, permissions),
      this.restorePermission(config, `/topic-permissions/${vhost}/${username}`, topicPermissions),
    ]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Failed to restore RabbitMQ permissions.');
    }
  }
}

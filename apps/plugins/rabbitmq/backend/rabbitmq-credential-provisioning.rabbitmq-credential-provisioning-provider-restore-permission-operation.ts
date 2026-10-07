import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderRestorePermissionsOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-restore-permissions-operation';

export abstract class RabbitmqCredentialProvisioningProviderRestorePermissionOperation extends RabbitmqCredentialProvisioningProviderRestorePermissionsOperation {
  protected async restorePermission<T>(
    config: MqttServerConnectionConfig,
    path: string,
    permissions: T | null,
  ): Promise<void> {
    await this.client.request(config, permissions ? 'PUT' : 'DELETE', path, permissions ?? undefined);
  }
}

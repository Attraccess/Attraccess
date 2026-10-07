import { randomBytes } from 'crypto';
import type { MqttCredentialRequest } from '@attraccess/plugins-backend-sdk';
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import type { ProvisionedMqttCredential } from '@attraccess/plugins-backend-sdk';
import { RabbitmqPermissions } from './rabbitmq-credential-provisioning.contracts';
import { RabbitmqTopicPermissions } from './rabbitmq-credential-provisioning.contracts';
import { RabbitmqCredentialProvisioningProviderWriteCredentialOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-write-credential-operation';

export abstract class RabbitmqCredentialProvisioningProviderWriteCredentialLockedOperation extends RabbitmqCredentialProvisioningProviderWriteCredentialOperation {
  protected async writeCredentialLocked(
    request: MqttCredentialRequest,
    config: MqttServerConnectionConfig,
  ): Promise<ProvisionedMqttCredential> {
    const password = randomBytes(24).toString('base64url');
    const vhost = encodeURIComponent(request.vhost);
    const username = encodeURIComponent(request.username);
    const existing = await this.userExists(config, username);
    const vhostExisted = await this.exists(config, `/vhosts/${vhost}`);
    await this.client.request(config, 'PUT', `/vhosts/${vhost}`);

    let previousPermissions: RabbitmqPermissions | null = null;
    let previousTopicPermissions: RabbitmqTopicPermissions | null = null;
    let permissionsCaptured = false;
    try {
      if (existing) {
        previousPermissions = await this.getPermissions(config, vhost, username);
        previousTopicPermissions = await this.getTopicPermissions(config, vhost, username);
        permissionsCaptured = true;
        await this.writePermissions(config, request, vhost, username);
        await this.client.request(config, 'PUT', `/users/${username}`, { password, tags: '' });
      } else {
        await this.client.request(config, 'PUT', `/users/${username}`, { password, tags: '' });
        await this.writePermissions(config, request, vhost, username);
      }
    } catch (error) {
      const rollback = [
        ...(existing && permissionsCaptured
          ? [() => this.restorePermissions(config, vhost, username, previousPermissions, previousTopicPermissions)]
          : !existing
            ? [() => this.client.request(config, 'DELETE', `/users/${username}`)]
            : []),
        ...(!vhostExisted ? [() => this.client.request(config, 'DELETE', `/vhosts/${vhost}`)] : []),
      ];
      await this.failAfterRollback(error, rollback);
    }

    return {
      providerId: this.id,
      identity: request.identity,
      username: request.username,
      vhost: request.vhost,
      password,
    };
  }
}

import type { MqttCredentialRequest } from '@attraccess/plugins-backend-sdk';
import { HttpException } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { RabbitmqCredentialProvisioningProviderRotateOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-rotate-operation';

export abstract class RabbitmqCredentialProvisioningProviderRevokeOperation extends RabbitmqCredentialProvisioningProviderRotateOperation {
  async revoke(
    request: Pick<MqttCredentialRequest, 'mqttServerId' | 'identity' | 'username' | 'vhost'>,
  ): Promise<void> {
    this.assertName(request.username, 'Username');
    const config = await this.requireConfig(request.mqttServerId);
    this.assertNotManagementUser(config, request.username);
    try {
      await this.client.request(config, 'DELETE', `/users/${encodeURIComponent(request.username)}`);
    } catch (error) {
      // A prior attempt may have removed the credential before its database state was recorded.
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) return;
      throw error;
    }
  }
}

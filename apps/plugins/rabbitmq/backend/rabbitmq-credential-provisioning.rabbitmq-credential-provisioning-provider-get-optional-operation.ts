import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { HttpException } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { RabbitmqCredentialProvisioningProviderGetTopicPermissionsOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-get-topic-permissions-operation';

export abstract class RabbitmqCredentialProvisioningProviderGetOptionalOperation extends RabbitmqCredentialProvisioningProviderGetTopicPermissionsOperation {
  protected async getOptional<T>(config: MqttServerConnectionConfig, path: string): Promise<T | null> {
    try {
      return await this.client.request<T>(config, 'GET', path);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }
}

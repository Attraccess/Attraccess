import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { HttpException } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { RabbitmqCredentialProvisioningProviderUserExistsOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-user-exists-operation';

export abstract class RabbitmqCredentialProvisioningProviderExistsOperation extends RabbitmqCredentialProvisioningProviderUserExistsOperation {
  protected async exists(config: MqttServerConnectionConfig, path: string): Promise<boolean> {
    try {
      await this.client.request(config, 'GET', path);
      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        return false;
      }
      throw error;
    }
  }
}

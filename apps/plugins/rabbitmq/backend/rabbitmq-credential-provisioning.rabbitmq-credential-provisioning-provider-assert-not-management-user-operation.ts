import { BadRequestException } from '@nestjs/common';
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderAssertNameOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-assert-name-operation';

export abstract class RabbitmqCredentialProvisioningProviderAssertNotManagementUserOperation extends RabbitmqCredentialProvisioningProviderAssertNameOperation {
  protected assertNotManagementUser(config: MqttServerConnectionConfig, username: string): void {
    if (config.username === username) {
      throw new BadRequestException('Refusing to modify the MQTT server management identity.');
    }
  }
}

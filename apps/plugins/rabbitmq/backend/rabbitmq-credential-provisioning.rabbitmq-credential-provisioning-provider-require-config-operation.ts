import { BadRequestException } from '@nestjs/common';
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderFailAfterRollbackOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-fail-after-rollback-operation';

export abstract class RabbitmqCredentialProvisioningProviderRequireConfigOperation extends RabbitmqCredentialProvisioningProviderFailAfterRollbackOperation {
  protected async requireConfig(mqttServerId: number): Promise<MqttServerConnectionConfig> {
    const config = await this.context.getMqttServerConfig(mqttServerId);
    if (!config) {
      throw new BadRequestException('MQTT server not found.');
    }
    return config;
  }
}

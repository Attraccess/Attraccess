import { BadRequestException } from '@nestjs/common';
import type { MqttCredentialRequest } from '@attraccess/plugins-backend-sdk';
import { RabbitmqCredentialProvisioningProviderRequireConfigOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-require-config-operation';

export abstract class RabbitmqCredentialProvisioningProviderAssertRequestOperation extends RabbitmqCredentialProvisioningProviderRequireConfigOperation {
  protected assertRequest(request: MqttCredentialRequest): void {
    this.assertName(request.identity, 'Identity');
    this.assertName(request.username, 'Username');
    this.assertName(request.vhost, 'Vhost');
    if (!Array.isArray(request.topicPolicy.publish) || !Array.isArray(request.topicPolicy.subscribe)) {
      throw new BadRequestException('Publish and subscribe topic policies must be arrays.');
    }
    for (const filter of [...request.topicPolicy.publish, ...request.topicPolicy.subscribe]) {
      if (typeof filter !== 'string' || filter.length === 0 || filter.length > 1024) {
        throw new BadRequestException('MQTT topic filters must be non-empty strings no longer than 1024 characters.');
      }
      this.assertTopicFilter(filter);
    }
  }
}

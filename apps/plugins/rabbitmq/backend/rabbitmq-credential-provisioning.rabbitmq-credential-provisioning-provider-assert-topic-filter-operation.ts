import { BadRequestException } from '@nestjs/common';
import { RabbitmqCredentialProvisioningProviderAssertRequestOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-assert-request-operation';

export abstract class RabbitmqCredentialProvisioningProviderAssertTopicFilterOperation extends RabbitmqCredentialProvisioningProviderAssertRequestOperation {
  protected assertTopicFilter(filter: string): void {
    // rabbitmq_mqtt maps both MQTT separators and literal dots to AMQP dots,
    // so dot-bearing levels cannot be authorized without widening access.
    if (filter.includes('.')) {
      throw new BadRequestException('RabbitMQ MQTT topic policies cannot contain dots.');
    }
    const segments = filter.split('/');
    for (const [index, segment] of segments.entries()) {
      if (
        (segment.includes('+') && segment !== '+') ||
        (segment.includes('#') && (segment !== '#' || index !== segments.length - 1))
      ) {
        throw new BadRequestException(
          'MQTT wildcards must occupy a complete topic level, and # must be the final level.',
        );
      }
    }
  }
}

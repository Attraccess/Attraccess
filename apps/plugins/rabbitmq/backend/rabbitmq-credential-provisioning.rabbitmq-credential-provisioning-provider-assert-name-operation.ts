import { BadRequestException } from '@nestjs/common';
import { RabbitmqCredentialProvisioningProviderAssertTopicFilterOperation } from './rabbitmq-credential-provisioning.rabbitmq-credential-provisioning-provider-assert-topic-filter-operation';

export abstract class RabbitmqCredentialProvisioningProviderAssertNameOperation extends RabbitmqCredentialProvisioningProviderAssertTopicFilterOperation {
  protected assertName(value: string, label: string): void {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 255) {
      throw new BadRequestException(`${label} must be a non-empty string no longer than 255 characters.`);
    }
  }
}

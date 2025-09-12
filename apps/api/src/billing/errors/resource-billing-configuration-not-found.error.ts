import { NotFoundException } from '@nestjs/common';

export class ResourceBillingConfigurationNotFoundException extends NotFoundException {
  constructor(resourceId: number) {
    super('RESOURCE_BILLING_CONFIGURATION_NOT_FOUND', {
      description: `Resource billing configuration not found for resource ${resourceId}`,
    });
  }
}

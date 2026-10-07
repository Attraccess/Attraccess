import { ResourceBillingConfigurationNotFoundException } from './errors/resource-billing-configuration-not-found.error';
import { UpdateResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerUpdateResourceBillingConfigurationThrowsWhenConfigurationNotFound(
  scope: UpdateResourceBillingConfigurationTestScope,
): void {
  it('throws when configuration not found', async () => {
    scope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(null);
    await expect(
      scope.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1, creditsPerMinute: 1 }),
    ).rejects.toBeInstanceOf(ResourceBillingConfigurationNotFoundException);
  });
}

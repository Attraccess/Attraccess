import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { UpdateResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerUpdateResourceBillingConfigurationAllowsPartialUpdateWithoutValidatingUndefinedFields(
  scope: UpdateResourceBillingConfigurationTestScope,
): void {
  it('allows partial update without validating undefined fields', async () => {
    const cfg = { resourceId: 1, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;

    scope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
    scope.resourceBillingConfigurationRepository.save.mockImplementation(
      async (arg) => arg as ResourceBillingConfiguration,
    );

    const result = await scope.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 3 });
    expect(result.creditsPerUsage).toBe(3);
    expect(result.creditsPerMinute).toBe(2);
  });
}

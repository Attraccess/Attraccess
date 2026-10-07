import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { UpdateResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerUpdateResourceBillingConfigurationCoercesNullsTo0AndSaves(
  scope: UpdateResourceBillingConfigurationTestScope,
): void {
  it('coerces nulls to 0 and saves', async () => {
    const cfg = { resourceId: 1, creditsPerUsage: 5, creditsPerMinute: 6 } as ResourceBillingConfiguration;

    scope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
    scope.resourceBillingConfigurationRepository.save.mockImplementation(
      async (arg) => arg as ResourceBillingConfiguration,
    );

    const result = await scope.service.updateResourceBillingConfiguration(1, {
      creditsPerUsage: null,
      creditsPerMinute: null,
    });

    expect(scope.resourceBillingConfigurationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ creditsPerUsage: 0, creditsPerMinute: 0 }),
    );
    expect(result.creditsPerUsage).toBe(0);
    expect(result.creditsPerMinute).toBe(0);
  });
}

import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { GetResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerGetResourceBillingConfigurationReturnsExistingConfigurationWhenPresent(
  scope: GetResourceBillingConfigurationTestScope,
): void {
  it('returns existing configuration when present', async () => {
    const existing = { resourceId: 7, creditsPerUsage: 1, creditsPerMinute: 2 } as ResourceBillingConfiguration;
    scope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(existing);

    const result = await scope.service.getResourceBillingConfiguration(7);
    expect(scope.resourceBillingConfigurationRepository.findOneBy).toHaveBeenCalledWith({ resourceId: 7 });
    expect(result).toBe(existing);
  });
}

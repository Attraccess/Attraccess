import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { GetResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerGetResourceBillingConfigurationCreatesAndSavesDefaultConfigurationWhenNoneExists(
  scope: GetResourceBillingConfigurationTestScope,
): void {
  it('creates and saves default configuration when none exists', async () => {
    scope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(null);
    const created = { resourceId: 42, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
    scope.resourceBillingConfigurationRepository.create.mockReturnValue(created);
    scope.resourceBillingConfigurationRepository.save.mockResolvedValue(created);

    const result = await scope.service.getResourceBillingConfiguration(42);
    expect(scope.resourceBillingConfigurationRepository.create).toHaveBeenCalledWith({
      resourceId: 42,
      creditsPerUsage: 0,
      creditsPerMinute: 0,
      creditsPerOperatingMinute: 0,
    });
    expect(scope.resourceBillingConfigurationRepository.save).toHaveBeenCalledWith(created);
    expect(result).toBe(created);
  });
}

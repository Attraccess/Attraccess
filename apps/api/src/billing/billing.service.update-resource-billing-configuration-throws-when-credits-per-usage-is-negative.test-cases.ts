import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { UpdateResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerUpdateResourceBillingConfigurationThrowsWhenCreditsPerUsageIsNegative(
  scope: UpdateResourceBillingConfigurationTestScope,
): void {
  it('throws when creditsPerUsage is negative', async () => {
    const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;

    scope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);
    await expect(scope.service.updateResourceBillingConfiguration(1, { creditsPerUsage: -1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
}

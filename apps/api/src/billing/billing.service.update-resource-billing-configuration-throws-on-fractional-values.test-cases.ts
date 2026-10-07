import { ResourceBillingConfiguration } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { UpdateResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerUpdateResourceBillingConfigurationThrowsOnFractionalValues(
  scope: UpdateResourceBillingConfigurationTestScope,
): void {
  it('throws on fractional values', async () => {
    const cfg = { resourceId: 1, creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration;
    scope.resourceBillingConfigurationRepository.findOneBy.mockResolvedValue(cfg);

    await expect(scope.service.updateResourceBillingConfiguration(1, { creditsPerUsage: 1.5 })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(scope.service.updateResourceBillingConfiguration(1, { creditsPerMinute: 2.2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
}

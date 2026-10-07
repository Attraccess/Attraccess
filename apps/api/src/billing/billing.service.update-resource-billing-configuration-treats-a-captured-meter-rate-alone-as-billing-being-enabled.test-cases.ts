import { ResourceBillingConfiguration, ResourceUsage } from '@attraccess/database-entities';
import { UpdateResourceBillingConfigurationTestScope } from './billing.service.spec';
export function registerUpdateResourceBillingConfigurationTreatsACapturedMeterRateAloneAsBillingBeingEnabled(
  scope: UpdateResourceBillingConfigurationTestScope,
): void {
  it('treats a captured meter rate alone as billing being enabled', async () => {
    jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
      creditsPerUsage: 0,
      creditsPerMinute: 0,
      creditsPerOperatingMinute: 0,
    } as ResourceBillingConfiguration);
    await expect(
      scope.service.isBillingEnabled(1, undefined, {
        meterRates: [{ meterId: 1, name: 'Heartbeat', creditsPerUnit: 3 }],
      } as ResourceUsage),
    ).resolves.toBe(true);
  });
}

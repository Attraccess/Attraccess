import { ResourceBillingConfiguration, ResourceUsage, User } from '@attraccess/database-entities';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { HandleResourceUsageStartTestScope } from './billing.service.spec';
export function registerHandleResourceUsageStartValidatesTheFrozenFixedFeeAfterPricingChangesDuringAStartFlow(
  scope: HandleResourceUsageStartTestScope,
): void {
  it('validates the frozen fixed fee after pricing changes during a start flow', async () => {
    const usage = {
      id: 22,
      creditsPerUsage: 5,
      sessionDurationCreditsPerMinute: 3,
      operatingDurationCreditsPerMinute: 7,
    } as ResourceUsage;
    jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
      creditsPerUsage: 99,
      creditsPerMinute: 99,
      creditsPerOperatingMinute: 99,
    } as ResourceBillingConfiguration);
    jest.spyOn(scope.service, 'getBalance').mockResolvedValue(8);

    await expect(scope.service.validateResourceUsageStart(205, usage, { id: 25 } as User)).resolves.toBeUndefined();

    jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
      creditsPerUsage: 0,
      creditsPerMinute: 0,
      creditsPerOperatingMinute: 0,
    } as ResourceBillingConfiguration);
    jest.spyOn(scope.service, 'getBalance').mockResolvedValue(7);
    await expect(scope.service.validateResourceUsageStart(205, usage, { id: 25 } as User)).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );
  });
}

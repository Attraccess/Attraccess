import { ResourceBillingConfiguration, ResourceUsage, User } from '@attraccess/database-entities';
import { BillingServiceChargeForResourceUsageTestScope } from './billing.service.spec';
export function registerBillingServiceChargeForResourceUsageValidatesATentativeStartWithoutCreatingBillingRecords(
  scope: BillingServiceChargeForResourceUsageTestScope,
): void {
  it('validates a tentative start without creating billing records', async () => {
    jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
      creditsPerUsage: 10,
      creditsPerMinute: 2,
    } as ResourceBillingConfiguration);
    jest.spyOn(scope.service, 'isBillingEnabled').mockResolvedValue(true);
    jest.spyOn(scope.service, 'getBalance').mockResolvedValue(12);

    await scope.service.validateResourceUsageStart(
      1,
      { sessionDurationCreditsPerMinute: 2 } as ResourceUsage,
      { id: 7 } as User,
    );

    expect(scope.billingTransactionRepository.save).not.toHaveBeenCalled();
    expect(scope.auditService.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
    expect(scope.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
  });
}

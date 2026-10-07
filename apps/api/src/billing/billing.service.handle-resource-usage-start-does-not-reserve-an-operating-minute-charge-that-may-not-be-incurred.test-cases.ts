import {
  BillingTransaction,
  ResourceBillingConfiguration,
  ResourceUsage,
  User,
  BillingTransactionStatus,
} from '@attraccess/database-entities';
import { HandleResourceUsageStartTestScope } from './billing.service.spec';
export function registerHandleResourceUsageStartDoesNotReserveAnOperatingMinuteChargeThatMayNotBeIncurred(
  scope: HandleResourceUsageStartTestScope,
): void {
  it('does not reserve an operating-minute charge that may not be incurred', async () => {
    const usage = {
      id: 22,
      sessionDurationCreditsPerMinute: 3,
      operatingDurationCreditsPerMinute: 7,
    } as ResourceUsage;
    const user = { id: 25 } as User;

    jest.spyOn(scope.service, 'getResourceBillingConfiguration').mockResolvedValue({
      creditsPerUsage: 5,
      creditsPerMinute: 3,
      creditsPerOperatingMinute: 7,
    } as ResourceBillingConfiguration);
    jest.spyOn(scope.service, 'isBillingEnabled').mockResolvedValue(true);
    jest.spyOn(scope.service, 'getBalance').mockResolvedValue(8);
    scope.billingTransactionRepository.save.mockResolvedValue({
      id: 55,
      userId: user.id,
      resourceUsageId: usage.id,
      amount: 0,
      status: BillingTransactionStatus.Pending,
    } as BillingTransaction);

    await expect(scope.service.handleResourceUsageStart(205, usage, user)).resolves.toBeUndefined();
    expect(scope.billingTransactionRepository.save).toHaveBeenCalledWith({
      userId: user.id,
      resourceUsageId: usage.id,
      amount: 0,
      status: BillingTransactionStatus.Pending,
    });
  });
}

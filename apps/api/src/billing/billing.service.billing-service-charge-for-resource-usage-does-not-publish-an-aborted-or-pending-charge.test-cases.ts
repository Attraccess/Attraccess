import { BillingTransactionStatus } from '@attraccess/database-entities';
import { BillingServiceChargeForResourceUsageTestScope } from './billing.service.spec';
export function registerBillingServiceChargeForResourceUsageDoesNotPublishAnAbortedOrPendingCharge(
  scope: BillingServiceChargeForResourceUsageTestScope,
): void {
  it('does not publish an aborted or pending charge', async () => {
    scope.billingTransactionRepository.findOne.mockResolvedValue(null);

    await scope.service.notifyResourceUsageCharge(123);

    expect(scope.billingTransactionRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 123, status: BillingTransactionStatus.Completed },
      }),
    );
    expect(scope.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
    expect(scope.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
  });
}

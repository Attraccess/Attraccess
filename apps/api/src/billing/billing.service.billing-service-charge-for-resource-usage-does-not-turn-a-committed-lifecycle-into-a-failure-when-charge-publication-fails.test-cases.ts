import { BillingServiceChargeForResourceUsageTestScope } from './billing.service.spec';
export function registerBillingServiceChargeForResourceUsageDoesNotTurnACommittedLifecycleIntoAFailureWhenChargePublicationFails(
  scope: BillingServiceChargeForResourceUsageTestScope,
): void {
  it('does not turn a committed lifecycle into a failure when charge publication fails', async () => {
    scope.billingTransactionRepository.findOne.mockRejectedValue(new Error('Read unavailable'));

    await expect(scope.service.notifyResourceUsageCharge(123)).resolves.toBeUndefined();

    expect(scope.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
  });
}

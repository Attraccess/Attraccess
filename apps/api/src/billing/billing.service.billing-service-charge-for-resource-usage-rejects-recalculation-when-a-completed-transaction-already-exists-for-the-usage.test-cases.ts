import { BillingTransaction, ResourceUsage, BillingTransactionStatus } from '@attraccess/database-entities';
import { BillingServiceChargeForResourceUsageTestScope } from './billing.service.spec';
export function registerBillingServiceChargeForResourceUsageRejectsRecalculationWhenACompletedTransactionAlreadyExistsForTheUsage(
  scope: BillingServiceChargeForResourceUsageTestScope,
): void {
  it('rejects recalculation when a completed transaction already exists for the usage', async () => {
    const usage = { id: 5 } as ResourceUsage;
    scope.billingTransactionRepository.findOneBy.mockResolvedValue({
      id: 123,
      resourceUsageId: usage.id,
      status: BillingTransactionStatus.Completed,
    } as BillingTransaction);

    await expect(scope.service.chargeForResourceUsage(usage)).rejects.toThrow(
      'Billing transaction already exists for this resource usage',
    );

    expect(scope.billingTransactionItemRepository.manager.transaction).not.toHaveBeenCalled();
  });
}

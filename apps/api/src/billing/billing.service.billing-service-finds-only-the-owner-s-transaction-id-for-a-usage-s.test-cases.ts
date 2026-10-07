import { BillingServiceTestScope } from './billing.service.spec';
export function registerBillingServiceFindsOnlyTheOwnerSTransactionIdForAUsageS(scope: BillingServiceTestScope): void {
  it.each([null, { id: 7 }])('finds only the owner’s transaction ID for a usage (%s)', async (transaction) => {
    scope.billingTransactionRepository.findOne.mockResolvedValue(transaction);
    expect(await scope.service.getTransactionIdForUsage(8, 2)).toBe(transaction?.id ?? null);
    expect(scope.billingTransactionRepository.findOne).toHaveBeenCalledWith({
      where: { resourceUsageId: 8, userId: 2 },
      select: ['id'],
    });
  });
}

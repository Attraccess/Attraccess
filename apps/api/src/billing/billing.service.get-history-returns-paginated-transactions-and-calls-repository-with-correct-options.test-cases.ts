import { BillingTransaction } from '@attraccess/database-entities';
import { GetHistoryTestScope } from './billing.service.spec';
export function registerGetHistoryReturnsPaginatedTransactionsAndCallsRepositoryWithCorrectOptions(
  scope: GetHistoryTestScope,
): void {
  it('returns paginated transactions and calls repository with correct options', async () => {
    const transactions = [{ id: 10 } as BillingTransaction, { id: 9 } as BillingTransaction];
    scope.billingTransactionRepository.findAndCount.mockResolvedValue([transactions, 2]);

    const result = await scope.service.getHistory(7, { page: 2, limit: 10 });

    expect(result).toEqual({ data: transactions, total: 2, page: 2, limit: 10 });
    expect(scope.billingTransactionRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        skip: 10,
        take: 10,
        relations: expect.arrayContaining(['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf']),
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    );
  });
}

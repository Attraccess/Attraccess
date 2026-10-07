import { BillingTransaction } from '@attraccess/database-entities';
import { BillingServiceTestScope } from './billing.service.spec';
export function registerBillingServiceRejectsAbsentTransactionsAndInvalidRefundAmountsBeforeWriting(
  scope: BillingServiceTestScope,
): void {
  it('rejects absent transactions and invalid refund amounts before writing', async () => {
    const get = jest.spyOn(scope.service, 'getTransaction').mockResolvedValue(null);
    await expect(scope.service.refundTransaction(9, 4, { amount: 25 })).rejects.toThrow();
    get.mockResolvedValue({ id: 4, amount: -100 } as BillingTransaction);
    await expect(scope.service.refundTransaction(9, 4, { amount: 0 })).rejects.toThrow('Amount must be greater than 0');
    await expect(scope.service.refundTransaction(9, 4, { amount: 101 })).rejects.toThrow();
    expect(scope.billingTransactionRepository.save).not.toHaveBeenCalled();
  });
}

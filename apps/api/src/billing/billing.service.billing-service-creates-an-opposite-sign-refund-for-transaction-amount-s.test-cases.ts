import { BillingTransaction, BillingTransactionStatus } from '@attraccess/database-entities';
import { BillingServiceTestScope } from './billing.service.spec';
export function registerBillingServiceCreatesAnOppositeSignRefundForTransactionAmountS(
  scope: BillingServiceTestScope,
): void {
  it.each([100, -100])('creates an opposite-sign refund for transaction amount %s', async (amount) => {
    const original = { id: 4, userId: 7, amount } as BillingTransaction;
    const refund = {
      id: 5,
      userId: 7,
      amount: amount > 0 ? -25 : 25,
      status: BillingTransactionStatus.Completed,
    } as BillingTransaction;
    jest.spyOn(scope.service, 'getTransaction').mockResolvedValueOnce(original).mockResolvedValueOnce(refund);
    scope.billingTransactionRepository.save.mockResolvedValue(refund);
    expect(await scope.service.refundTransaction(9, 4, { amount: 25 })).toBe(refund);
    expect(scope.billingTransactionRepository.save).toHaveBeenCalledWith({
      userId: 7,
      initiatorId: 9,
      amount: refund.amount,
      status: BillingTransactionStatus.Completed,
      refundOfId: 4,
    });
    expect(scope.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith(refund);
    expect(scope.auditService.recordBillingTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 5, source: 'refund', amount: refund.amount }),
    );
  });
}

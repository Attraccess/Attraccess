import { BillingTransaction, User, BillingTransactionStatus } from '@attraccess/database-entities';
import { CreateManualTransactionTestScope } from './billing.service.spec';
export function registerCreateManualTransactionSucceedsAndSavesTheTransactionWhenUserExists(
  scope: CreateManualTransactionTestScope,
): void {
  it('succeeds and saves the transaction when user exists', async () => {
    scope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 5 } as User);
    scope.billingTransactionRepository.save.mockResolvedValue({ id: 123 } as BillingTransaction);

    const result = await scope.service.createManualTransaction(1, 2, 100);

    expect(scope.billingTransactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, initiatorId: 2, amount: 100 }),
    );
    expect(result).toEqual({ id: 123 });
    expect(scope.liveNotificationsService.notifyTransactionUpdate).toHaveBeenCalledWith({ id: 123 });
    expect(scope.auditService.recordBillingTransaction).toHaveBeenCalledWith({
      transactionId: 123,
      userId: 1,
      initiatorId: 2,
      amount: 100,
      status: BillingTransactionStatus.Completed,
      source: 'manual',
    });
  });
}

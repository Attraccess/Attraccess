import { BillingTransaction, User } from '@attraccess/database-entities';
import { CreateManualTransactionTestScope } from './billing.service.spec';
export function registerCreateManualTransactionAllowsNegativeResultingBalanceWhenFailOnInsufficientBalanceIsFalse(
  scope: CreateManualTransactionTestScope,
): void {
  it('allows negative resulting balance when failOnInsufficientBalance is false', async () => {
    scope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);
    scope.billingTransactionRepository.save.mockResolvedValue({ id: 789 } as BillingTransaction);

    const result = await scope.service.createManualTransaction(1, 2, -20, false);
    expect(scope.billingTransactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
    );
    expect(result).toEqual({ id: 789 });
  });
}

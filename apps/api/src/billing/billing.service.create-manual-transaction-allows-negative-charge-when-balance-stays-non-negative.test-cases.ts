import { BillingTransaction, User } from '@attraccess/database-entities';
import { CreateManualTransactionTestScope } from './billing.service.spec';
export function registerCreateManualTransactionAllowsNegativeChargeWhenBalanceStaysNonNegative(
  scope: CreateManualTransactionTestScope,
): void {
  it('allows negative charge when balance stays non-negative', async () => {
    scope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
    scope.billingTransactionRepository.save.mockResolvedValue({ id: 456 } as BillingTransaction);

    const result = await scope.service.createManualTransaction(1, 2, -20, true);

    expect(scope.billingTransactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, initiatorId: 2, amount: -20 }),
    );
    expect(result).toEqual({ id: 456 });
  });
}

import { User } from '@attraccess/database-entities';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { CreateManualTransactionTestScope } from './billing.service.spec';
export function registerCreateManualTransactionThrowsInsufficientBalanceErrorWhenResultingBalanceWouldBeNegative(
  scope: CreateManualTransactionTestScope,
): void {
  it('throws InsufficientBalanceError when resulting balance would be negative', async () => {
    scope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 10 } as User);

    await expect(scope.service.createManualTransaction(1, 2, -20, true)).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );
  });
}

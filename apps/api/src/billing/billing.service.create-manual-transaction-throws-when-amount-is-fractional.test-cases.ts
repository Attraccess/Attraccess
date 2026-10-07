import { User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { CreateManualTransactionTestScope } from './billing.service.spec';
export function registerCreateManualTransactionThrowsWhenAmountIsFractional(
  scope: CreateManualTransactionTestScope,
): void {
  it('throws when amount is fractional', async () => {
    scope.userRepository.findOneBy.mockResolvedValue({ id: 1, creditBalance: 50 } as User);
    await expect(scope.service.createManualTransaction(1, 2, 10.5)).rejects.toBeInstanceOf(BadRequestException);
  });
}

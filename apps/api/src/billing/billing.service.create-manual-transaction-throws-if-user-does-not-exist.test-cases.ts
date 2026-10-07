import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { CreateManualTransactionTestScope } from './billing.service.spec';
export function registerCreateManualTransactionThrowsIfUserDoesNotExist(scope: CreateManualTransactionTestScope): void {
  it('throws if user does not exist', async () => {
    scope.userRepository.findOneBy.mockResolvedValue(null);

    await expect(scope.service.createManualTransaction(1, 2, 100)).rejects.toBeInstanceOf(UserNotFoundException);
  });
}

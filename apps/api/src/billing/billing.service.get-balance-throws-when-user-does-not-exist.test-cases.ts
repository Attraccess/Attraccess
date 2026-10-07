import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { GetBalanceTestScope } from './billing.service.spec';
export function registerGetBalanceThrowsWhenUserDoesNotExist(scope: GetBalanceTestScope): void {
  it('throws when user does not exist', async () => {
    scope.userRepository.findOneBy.mockResolvedValue(null);

    await expect(scope.service.getBalance(999)).rejects.toBeInstanceOf(UserNotFoundException);
  });
}

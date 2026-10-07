import { User } from '@attraccess/database-entities';
import { GetBalanceTestScope } from './billing.service.spec';
export function registerGetBalanceReturnsCreditBalanceForExistingUser(scope: GetBalanceTestScope): void {
  it('returns creditBalance for existing user', async () => {
    const user = { id: 1, creditBalance: 42 } as User;
    scope.userRepository.findOneBy.mockResolvedValue(user);

    await expect(scope.service.getBalance(1)).resolves.toBe(42);
    expect(scope.userRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
  });
}

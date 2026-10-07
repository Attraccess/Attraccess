import { User } from '@attraccess/database-entities';
import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
export function registerRejectsMissingUsersInvalidTokensAndExpiredVerificationLinksWithoutModifyingCases(
  fixture: ReturnType<typeof registerAuthServiceFixture>,
) {
  it('rejects missing users, invalid tokens and expired verification links without modifying the account', async () => {
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue(null);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
      id: 7,
      emailVerificationToken: 'other',
      emailVerificationTokenExpiresAt: new Date(Date.now() + 60000),
    } as User);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
      id: 7,
      emailVerificationToken: 'hashed:token',
      emailVerificationTokenExpiresAt: new Date(0),
    } as User);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    expect(fixture.usersService.updateOne).not.toHaveBeenCalled();
  });
}

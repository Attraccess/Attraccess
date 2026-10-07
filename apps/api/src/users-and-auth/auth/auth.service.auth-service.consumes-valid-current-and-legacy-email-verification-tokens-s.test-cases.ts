import { User } from '@attraccess/database-entities';
import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
export function registerConsumesValidCurrentAndLegacyEmailVerificationTokensSCases(
  fixture: ReturnType<typeof registerAuthServiceFixture>,
) {
  it.each(['hashed:token', 'token'])(
    'consumes valid current and legacy email verification tokens: %s',
    async (stored) => {
      jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
        id: 7,
        emailVerificationToken: stored,
        emailVerificationTokenExpiresAt: new Date(Date.now() + 60000),
      } as User);
      await fixture.authService.verifyEmail('user@example.com', 'token');
      expect(fixture.usersService.updateOne).toHaveBeenCalledWith(7, {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
      });
    },
  );
}

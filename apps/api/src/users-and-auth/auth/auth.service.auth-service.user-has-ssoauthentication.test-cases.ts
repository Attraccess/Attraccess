import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
export function registerUserHasSsoauthenticationCases(fixture: ReturnType<typeof registerAuthServiceFixture>) {
  describe('userHasSSOAuthentication', () => {
    it('returns true when user has an SSO authentication detail', async () => {
      (fixture.authenticationDetailRepository.count as jest.Mock).mockResolvedValue(1);

      const result = await fixture.authService.userHasSSOAuthentication(1);

      expect(result).toBe(true);
    });

    it('returns false when user has no SSO authentication detail', async () => {
      (fixture.authenticationDetailRepository.count as jest.Mock).mockResolvedValue(0);

      const result = await fixture.authService.userHasSSOAuthentication(1);

      expect(result).toBe(false);
    });
  });
}

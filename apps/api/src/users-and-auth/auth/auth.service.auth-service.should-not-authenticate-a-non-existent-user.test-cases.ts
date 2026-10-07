import { AuthenticationType } from '@attraccess/database-entities';
import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
export function registerShouldNotAuthenticateANonExistentUserCases(
  fixture: ReturnType<typeof registerAuthServiceFixture>,
) {
  it('should not authenticate a non-existent user', async () => {
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue(null);

    const isAuthenticated = await fixture.authService.getUserByUsernameAndAuthenticationDetails('nonexistentuser', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'password' },
    });

    expect(isAuthenticated).toBeNull();
    // A login attempt for an unknown username is the dominant brute-force vector
    // and must be counted as a failed login so the HighFailedLoginRate alert fires.
    expect(fixture.mockMetricsService.authLoginTotal.inc).toHaveBeenCalledWith({ method: 'local', status: 'fail' });
  });
}

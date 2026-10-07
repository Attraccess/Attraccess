import { AuthenticationDetail, AuthenticationType, SSOProviderType } from '@attraccess/database-entities';
import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
export function registerFindSsoauthenticationDetailCases(fixture: ReturnType<typeof registerAuthServiceFixture>) {
  describe('findSSOAuthenticationDetail', () => {
    it('returns the SSO detail when one exists for the user', async () => {
      const ssoDetail = {
        id: 5,
        userId: 1,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 10,
        ssoSubject: 'sub-abc',
      } as AuthenticationDetail;

      jest.spyOn(fixture.authenticationDetailRepository, 'findOne').mockResolvedValue(ssoDetail);

      const result = await fixture.authService.findSSOAuthenticationDetail(1);

      expect(result).toEqual(ssoDetail);
      expect(fixture.authenticationDetailRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 1, type: AuthenticationType.SSO },
      });
    });

    it('returns null when no SSO detail exists for the user', async () => {
      jest.spyOn(fixture.authenticationDetailRepository, 'findOne').mockResolvedValue(null);

      const result = await fixture.authService.findSSOAuthenticationDetail(99);

      expect(result).toBeNull();
    });
  });
}

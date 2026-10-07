import { AuthService } from '../auth.service';
import { AuthenticationDetail, AuthenticationType, SSOProviderType } from '@attraccess/database-entities';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';
export function registerLinkUserToExternalAccountCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  describe('linkUserToExternalAccount', () => {
    const linkPayload = {
      email: 'user@example.com',
      providerId: 1,
      providerType: SSOProviderType.OIDC,
      ssoSubject: 'sub-123',
      iat: Date.now(),
      exp: Date.now() + 600000,
    };

    const baseUser = {
      id: 42,
      authenticationDetails: [
        {
          id: 10,
          type: AuthenticationType.LOCAL_PASSWORD,
        } as AuthenticationDetail,
      ],
    };

    function setupLinkMocks({
      existingSSODetail = null as AuthenticationDetail | null,
      passwordOk = true,
      ssoSubjectExistsForOtherUser = false,
      hasLocalPassword = true,
      userExists = true,
      payload = linkPayload,
    } = {}) {
      const authService = fixture.module.get<AuthService>(AuthService);
      const usersService = fixture.module.get<UsersService>(UsersService);

      (fixture.linkTokenService.verify as jest.Mock).mockResolvedValue(payload);
      (authService.findSSOAuthenticationDetail as jest.Mock).mockResolvedValue(existingSSODetail);
      (authService.updateSSOSubject as jest.Mock).mockResolvedValue(undefined);
      (authService.validateAuthenticationDetails as jest.Mock).mockResolvedValue(passwordOk);
      (authService.findUserIdBySSO as jest.Mock).mockResolvedValue(ssoSubjectExistsForOtherUser ? 999 : null);
      (authService.addAuthenticationDetails as jest.Mock).mockResolvedValue(undefined);
      (authService.removeAuthenticationDetails as jest.Mock).mockResolvedValue(undefined);
      (usersService.updateOne as jest.Mock).mockResolvedValue(undefined);

      const user = userExists
        ? {
            ...baseUser,
            authenticationDetails: hasLocalPassword ? baseUser.authenticationDetails : [],
          }
        : null;
      (usersService.findOne as jest.Mock).mockResolvedValue(user);

      return { authService, usersService };
    }

    describe('fresh linking (no prior SSO)', () => {
      it('links when password is valid and removes local password', async () => {
        const { authService, usersService } = setupLinkMocks();

        const result = await fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

        expect(result).toEqual({ OK: true });
        expect(authService.addAuthenticationDetails).toHaveBeenCalledWith(baseUser.id, {
          type: AuthenticationType.SSO,
          details: { providerId: 1, providerType: SSOProviderType.OIDC, subject: 'sub-123' },
        });
        expect(authService.updateSSOSubject).not.toHaveBeenCalled();
        expect(authService.removeAuthenticationDetails).toHaveBeenCalledWith(10);
        expect(usersService.updateOne).toHaveBeenCalledWith(baseUser.id, { externalIdentifier: null });
      });

      it('verifies link token', async () => {
        setupLinkMocks();

        await fixture.controller.linkUserToExternalAccount({ linkToken: 'my-token', password: 'secret' });

        expect(fixture.linkTokenService.verify).toHaveBeenCalledWith('my-token');
      });

      it('looks up user by email from link payload', async () => {
        const { usersService } = setupLinkMocks();

        await fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

        expect(usersService.findOne).toHaveBeenCalledWith({ email: 'user@example.com' }, ['authenticationDetails']);
      });
    });

    describe('re-linking (same provider, changed subject)', () => {
      const existingSSODetailSameProvider: AuthenticationDetail = {
        id: 20,
        userId: 42,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 1,
        ssoSubject: 'old-sub-from-test-idp',
      } as AuthenticationDetail;

      it('updates ssoSubject when re-linking to the same provider', async () => {
        const { authService } = setupLinkMocks({ existingSSODetail: existingSSODetailSameProvider });

        const result = await fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

        expect(result).toEqual({ OK: true });
        expect(authService.updateSSOSubject).toHaveBeenCalledWith(20, 'sub-123');
        expect(authService.addAuthenticationDetails).not.toHaveBeenCalled();
      });

      it('still validates password before updating subject', async () => {
        const { authService } = setupLinkMocks({
          existingSSODetail: existingSSODetailSameProvider,
          passwordOk: false,
        });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);

        expect(authService.updateSSOSubject).not.toHaveBeenCalled();
      });

      it('removes local password after re-linking', async () => {
        const { authService } = setupLinkMocks({ existingSSODetail: existingSSODetailSameProvider });

        await fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

        expect(authService.removeAuthenticationDetails).toHaveBeenCalledWith(10);
      });

      it('clears externalIdentifier after re-linking', async () => {
        const { usersService } = setupLinkMocks({ existingSSODetail: existingSSODetailSameProvider });

        await fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

        expect(usersService.updateOne).toHaveBeenCalledWith(42, { externalIdentifier: null });
      });

      it('rejects re-linking if new subject is already bound to another user', async () => {
        const { authService } = setupLinkMocks({
          existingSSODetail: existingSSODetailSameProvider,
          ssoSubjectExistsForOtherUser: true,
        });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow(BadRequestException);

        expect(authService.updateSSOSubject).not.toHaveBeenCalled();
      });
    });

    describe('cross-provider rejection', () => {
      const existingSSODetailDifferentProvider: AuthenticationDetail = {
        id: 30,
        userId: 42,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.SAML,
        providerId: 2,
        ssoSubject: 'saml-sub-456',
      } as AuthenticationDetail;

      it('rejects linking when user is already linked to a different provider', async () => {
        const { authService } = setupLinkMocks({ existingSSODetail: existingSSODetailDifferentProvider });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow(BadRequestException);

        expect(authService.addAuthenticationDetails).not.toHaveBeenCalled();
        expect(authService.updateSSOSubject).not.toHaveBeenCalled();
      });

      it('throws SSO_ALREADY_LINKED error message for cross-provider linking', async () => {
        setupLinkMocks({ existingSSODetail: existingSSODetailDifferentProvider });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow('SSO_ALREADY_LINKED');
      });

      it('does not validate password when rejecting cross-provider link', async () => {
        const { authService } = setupLinkMocks({ existingSSODetail: existingSSODetailDifferentProvider });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow(BadRequestException);

        expect(authService.validateAuthenticationDetails).not.toHaveBeenCalled();
      });
    });

    describe('error conditions', () => {
      it('throws UnauthorizedException when user not found by email', async () => {
        setupLinkMocks({ userExists: false });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('rejects when no local password is present', async () => {
        setupLinkMocks({ hasLocalPassword: false });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws PASSWORD_REQUIRED when no local password exists', async () => {
        setupLinkMocks({ hasLocalPassword: false });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow('PASSWORD_REQUIRED');
      });

      it('rejects when password verification fails', async () => {
        setupLinkMocks({ passwordOk: false });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('rejects when SSO subject is already linked to another user', async () => {
        setupLinkMocks({ ssoSubjectExistsForOtherUser: true });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws SSO_SUBJECT_ALREADY_LINKED for subject collision', async () => {
        setupLinkMocks({ ssoSubjectExistsForOtherUser: true });

        await expect(
          fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' }),
        ).rejects.toThrow('SSO_SUBJECT_ALREADY_LINKED');
      });
    });
  });
}

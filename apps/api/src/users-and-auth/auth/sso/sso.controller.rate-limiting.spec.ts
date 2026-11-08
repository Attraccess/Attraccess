import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';
import { SSOProviderType, AuthenticationDetail, AuthenticationType } from '@attraccess/database-entities';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './../auth.service';
import { UsersService } from './../../users/users.service';
import type { Request } from 'express';
import { AccountLockedException, TooManyAuthAttemptsException } from '../../rate-limiting/exceptions';

describe('SsoController rate limiting (ATT-1223)', () => {
  const fixture = registerSsoControllerFixture();

  describe('linkUserToExternalAccount', () => {
    const linkRequest = { ip: '203.0.113.9', res: { setHeader: jest.fn() } } as unknown as Request;
    const linkPayload = {
      jti: 'jti-1',
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

    describe('brute-force protection and single-use tokens', () => {
      const link = () =>
        fixture.controller.linkUserToExternalAccount({ linkToken: 'token', password: 'pw' }, linkRequest);

      it('checks the coarse IP limit before verifying the token, then the per-account limit', async () => {
        setupLinkMocks();

        await link();

        expect(fixture.bruteForce.assertIpAllowed).toHaveBeenNthCalledWith(1, 'sso_link_account', '203.0.113.9', null);
        expect(fixture.bruteForce.assertIpAllowed).toHaveBeenNthCalledWith(
          2,
          'sso_link_account',
          '203.0.113.9',
          'user@example.com',
        );
      });

      it('refuses a throttled IP with 429, Retry-After and an audit entry, without touching the token', async () => {
        setupLinkMocks();
        fixture.bruteForce.assertIpAllowed.mockRejectedValueOnce(new TooManyAuthAttemptsException(30));

        await expect(link()).rejects.toBeInstanceOf(TooManyAuthAttemptsException);

        expect(linkRequest.res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
        expect(fixture.authAudit.log).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'sso_link_account', outcome: 'rate_limited', reason: 'ip_throttled' }),
        );
        expect(fixture.linkTokenService.verify).not.toHaveBeenCalled();
      });

      it('counts an invalid token as an IP failure only', async () => {
        setupLinkMocks();
        (fixture.linkTokenService.verify as jest.Mock).mockRejectedValue(
          new UnauthorizedException('INVALID_LINK_TOKEN'),
        );

        await expect(link()).rejects.toThrow('INVALID_LINK_TOKEN');

        expect(fixture.bruteForce.recordFailure).toHaveBeenCalledWith('sso_link_account', '203.0.113.9', null, 'invalid-link-token');
        expect(fixture.authAudit.log).toHaveBeenCalledWith(
          expect.objectContaining({ outcome: 'invalid_token', reason: 'INVALID_LINK_TOKEN' }),
        );
      });

      it.each(['LINK_TOKEN_USED', 'LINK_TOKEN_EXHAUSTED'])(
        'rejects a %s token before the password check',
        async (code) => {
          const { authService } = setupLinkMocks();
          (fixture.linkTokenService.assertUsable as jest.Mock).mockRejectedValue(new UnauthorizedException(code));

          await expect(link()).rejects.toThrow(code);

          expect(authService.validateAuthenticationDetails).not.toHaveBeenCalled();
          expect(fixture.bruteForce.recordFailure).toHaveBeenCalledWith('sso_link_account', '203.0.113.9', null, 'invalid-link-token');
        },
      );

      it('counts an unknown user as an IP failure keyed by email', async () => {
        setupLinkMocks({ userExists: false });

        await expect(link()).rejects.toThrow(UnauthorizedException);

        expect(fixture.bruteForce.recordFailure).toHaveBeenCalledWith(
          'sso_link_account',
          '203.0.113.9',
          null,
          'user@example.com',
        );
        expect(fixture.authAudit.log).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'unknown_user' }));
      });

      it('returns 423 with Retry-After for a locked account and does not check the password', async () => {
        const { authService } = setupLinkMocks();
        fixture.bruteForce.assertAccountAllowed.mockRejectedValueOnce(new AccountLockedException(60));

        await expect(link()).rejects.toBeInstanceOf(AccountLockedException);

        expect(linkRequest.res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
        expect(authService.validateAuthenticationDetails).not.toHaveBeenCalled();
        expect(fixture.authAudit.log).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'account_locked' }));
      });

      it('records a wrong password against IP, account and token', async () => {
        setupLinkMocks({ passwordOk: false });

        await expect(link()).rejects.toThrow(UnauthorizedException);

        expect(fixture.bruteForce.recordFailure).toHaveBeenCalledWith(
          'sso_link_account',
          '203.0.113.9',
          42,
          'user@example.com',
        );
        expect(fixture.linkTokenService.recordFailedPassword).toHaveBeenCalledWith(linkPayload);
        expect(fixture.authAudit.log).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'sso_link_account', outcome: 'invalid_credentials', userId: 42 }),
        );
        expect(fixture.linkTokenService.consume).not.toHaveBeenCalled();
      });

      it('does not count the password-free 400 outcomes as failures', async () => {
        setupLinkMocks({ hasLocalPassword: false });

        await expect(link()).rejects.toThrow('PASSWORD_REQUIRED');

        expect(fixture.bruteForce.recordFailure).not.toHaveBeenCalled();
      });

      it('checks the subject collision before consuming the token', async () => {
        setupLinkMocks({ ssoSubjectExistsForOtherUser: true });

        await expect(link()).rejects.toThrow('SSO_SUBJECT_ALREADY_LINKED');

        expect(fixture.linkTokenService.consume).not.toHaveBeenCalled();
      });

      it('writes nothing when the token was consumed by a concurrent request', async () => {
        const { authService } = setupLinkMocks();
        (fixture.linkTokenService.consume as jest.Mock).mockRejectedValue(new UnauthorizedException('LINK_TOKEN_USED'));

        await expect(link()).rejects.toThrow('LINK_TOKEN_USED');

        expect(authService.addAuthenticationDetails).not.toHaveBeenCalled();
        expect(authService.removeAuthenticationDetails).not.toHaveBeenCalled();
      });

      it('consumes the token before the writes and clears the counters on success', async () => {
        const { authService } = setupLinkMocks();
        const order: string[] = [];
        (fixture.linkTokenService.consume as jest.Mock).mockImplementation(async () => void order.push('consume'));
        (authService.addAuthenticationDetails as jest.Mock).mockImplementation(async () => void order.push('write'));

        await link();

        expect(order).toEqual(['consume', 'write']);
        expect(fixture.bruteForce.recordSuccess).toHaveBeenCalledWith(
          'sso_link_account',
          '203.0.113.9',
          42,
          'user@example.com',
        );
        expect(fixture.authAudit.log).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'sso_link_account', outcome: 'success', userId: 42 }),
        );
      });
    });
  });

  describe('sso provisioning endpoints', () => {
    describe('rate limiting', () => {
      const requestWith = (token?: string) =>
        ({
          ip: '198.51.100.7',
          headers: token ? { authorization: `Bearer ${token}` } : {},
          res: { setHeader: jest.fn() },
        }) as unknown as Request & { res: { setHeader: jest.Mock } };
      const username = `provider:${SSOProviderType.OIDC}:1`;

      it('throttles per IP and provider before checking the secret', async () => {
        const request = requestWith('test-client-secret');
        fixture.bruteForce.assertIpAllowed.mockRejectedValueOnce(new TooManyAuthAttemptsException(45));

        await expect(fixture.controller.oidcLogout('1', request, { subject: 's' })).rejects.toBeInstanceOf(
          TooManyAuthAttemptsException,
        );

        expect(fixture.bruteForce.assertIpAllowed).toHaveBeenCalledWith('sso_provisioning', '198.51.100.7', username);
        expect(request.res.setHeader).toHaveBeenCalledWith('Retry-After', '45');
        expect(fixture.authAudit.log).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'sso_provisioning', outcome: 'rate_limited' }),
        );
        expect(fixture.bruteForce.recordFailure).not.toHaveBeenCalled();
      });

      it.each([
        ['a wrong secret', 'wrong'],
        ['a missing secret', undefined],
      ])('counts %s as a failure', async (_name, token) => {
        await expect(fixture.controller.oidcLogout('1', requestWith(token), { subject: 's' })).rejects.toThrow(
          UnauthorizedException,
        );

        expect(fixture.bruteForce.recordFailure).toHaveBeenCalledWith(
          'sso_provisioning',
          '198.51.100.7',
          null,
          username,
        );
        expect(fixture.bruteForce.recordSuccess).not.toHaveBeenCalled();
      });

      it('counts an unconfigured secret as a failure', async () => {
        jest.spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
          ...fixture.mockSSOProvider,
          oidcConfiguration: { ...fixture.mockSSOProvider.oidcConfiguration, clientSecret: '' },
        } as never);

        await expect(fixture.controller.oidcLogout('1', requestWith('anything'), { subject: 's' })).rejects.toThrow(
          'SSO_CLIENT_SECRET_NOT_CONFIGURED',
        );

        expect(fixture.bruteForce.recordFailure).toHaveBeenCalledTimes(1);
      });

      it('clears the counter for a valid secret and does not count an unknown user', async () => {
        const users = fixture.module.get<UsersService>(UsersService);
        (users.findOneBySSO as jest.Mock).mockResolvedValue(null);
        (users.findOne as jest.Mock).mockResolvedValue(null);

        await expect(
          fixture.controller.oidcDeleteUser('1', requestWith('test-client-secret'), { subject: 'ghost' }),
        ).rejects.toThrow('SSO_USER_NOT_FOUND');

        expect(fixture.bruteForce.recordSuccess).toHaveBeenCalledWith(
          'sso_provisioning',
          '198.51.100.7',
          null,
          username,
        );
        expect(fixture.bruteForce.recordFailure).not.toHaveBeenCalled();
      });
    });
  });
});

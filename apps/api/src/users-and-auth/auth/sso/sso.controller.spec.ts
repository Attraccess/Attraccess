import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';
import * as discovery from './sso-discovery-request';
import { SSOProviderType, AuthenticationDetail, AuthenticationType, SSOProvider } from '@attraccess/database-entities';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './../auth.service';
import { UsersService } from './../../users/users.service';
import { SessionService } from './../session.service';
import type { Response, Request } from 'express';
import { SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY } from './oidc/oidc-cookie-state-store';
import { RbacService } from './../../rbac/rbac.service';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';

describe('SsoController', () => {
  const fixture = registerSsoControllerFixture();

  it('should be defined', () => {
    expect(fixture.controller).toBeDefined();
  });

  describe('getProviders', () => {
    it('should return an array of providers', async () => {
      const result = await fixture.controller.getAll();
      expect(result).toEqual([fixture.mockSSOProvider]);
      expect(fixture.ssoService.getAllProviders).toHaveBeenCalled();
    });
  });

  describe('getProviderById', () => {
    it('should return a single provider', async () => {
      const result = await fixture.controller.getOneById('1');
      expect(result).toEqual(fixture.mockSSOProvider);
      expect(fixture.ssoService.getProviderById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if provider not found', async () => {
      jest.spyOn(fixture.ssoService, 'getProviderById').mockRejectedValueOnce(new NotFoundException());
      await expect(fixture.controller.getOneById('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProvider', () => {
    it('should create a new provider when user has permission', async () => {
      const createDto: CreateSSOProviderDto = {
        name: 'New Provider',
        type: SSOProviderType.OIDC,
        oidcConfiguration: {
          issuer: 'https://new-issuer.com',
          authorizationURL: 'https://new-issuer.com/auth',
          tokenURL: 'https://new-issuer.com/token',
          userInfoURL: 'https://new-issuer.com/userinfo',
          clientId: 'new-client-id',
          clientSecret: 'new-client-secret',
        },
      };

      const result = await fixture.controller.createOne(createDto, { user: { id: 1 } } as AuthenticatedRequest);

      expect(result).toEqual(fixture.mockSSOProvider);
      expect(fixture.ssoService.createProvider).toHaveBeenCalledWith(createDto);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provider.created',
          actorId: 1,
          details: { before: 'null', after: expect.not.stringContaining('test-client-secret') },
        }),
      );
    });

    it('keeps provider creation successful when the awaited audit receipt fails', async () => {
      fixture.ssoAudit.record.mockRejectedValueOnce(new Error('audit unavailable'));

      await expect(
        fixture.controller.createOne(
          { name: 'New Provider', type: SSOProviderType.OIDC } as CreateSSOProviderDto,
          {
            user: { id: 1 },
          } as AuthenticatedRequest,
        ),
      ).resolves.toEqual(fixture.mockSSOProvider);
    });
  });

  describe('updateProvider', () => {
    it('should update a provider when user has permission', async () => {
      const updateDto: UpdateSSOProviderDto = {
        name: 'Updated Provider',
      };

      // Provider without permission mappings — no ceiling check triggered.
      jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce({
        ...fixture.mockSSOProvider,
        oidcConfiguration: { ...fixture.mockSSOProvider.oidcConfiguration, roleMappings: {} },
      } as SSOProvider);

      const mockReq = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;
      const result = await fixture.controller.updateOne('1', updateDto, mockReq);

      expect(result).toEqual(fixture.mockSSOProvider);
      expect(fixture.ssoService.updateProvider).toHaveBeenCalledWith(1, updateDto);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provider.updated',
          details: expect.objectContaining({ before: expect.any(String), after: expect.any(String) }),
        }),
      );
    });

    it('gates explicit null roleMappings behind users.roles.manage', async () => {
      const updateDto = {
        oidcConfiguration: { roleMappings: null },
      } as unknown as UpdateSSOProviderDto;

      const mockReq = { user: { id: 1, effectivePermissions: new Set<string>() } } as unknown as AuthenticatedRequest;

      await expect(fixture.controller.updateOne('1', updateDto, mockReq)).rejects.toThrow(ForbiddenException);
      expect(fixture.ssoService.updateProvider).not.toHaveBeenCalled();
    });

    it('does not audit a provider update that fails before commit', async () => {
      jest.spyOn(fixture.ssoService, 'updateProvider').mockRejectedValueOnce(new Error('configuration write failed'));
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;

      await expect(fixture.controller.updateOne('1', { name: 'Updated Provider' }, request)).rejects.toThrow(
        'configuration write failed',
      );

      expect(fixture.ssoAudit.record).not.toHaveBeenCalled();
    });

    it('suppresses a true no-op but records a safe secret rotation flag', async () => {
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;

      await fixture.controller.updateOne('1', {}, request);
      expect(fixture.ssoAudit.record).not.toHaveBeenCalled();

      await fixture.controller.updateOne(
        '1',
        {
          oidcConfiguration: { clientSecret: fixture.mockSSOProvider.oidcConfiguration?.clientSecret },
        } as UpdateSSOProviderDto,
        request,
      );
      expect(fixture.ssoAudit.record).not.toHaveBeenCalled();

      jest.spyOn(fixture.ssoService, 'updateProvider').mockResolvedValueOnce({
        ...fixture.mockSSOProvider,
        oidcConfiguration: { ...fixture.mockSSOProvider.oidcConfiguration, clientSecret: 'replacement' },
      } as SSOProvider);
      await fixture.controller.updateOne(
        '1',
        { oidcConfiguration: { clientSecret: 'replacement' } } as UpdateSSOProviderDto,
        request,
      );
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provider.updated',
          details: expect.objectContaining({ changes: JSON.stringify({ changed: [], rotated: ['clientSecret'] }) }),
        }),
      );
    });

    it('does not report rotation when a SAML form resubmits its unchanged certificate', async () => {
      jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce(fixture.mockSamlProvider);
      jest.spyOn(fixture.ssoService, 'updateProvider').mockResolvedValueOnce(fixture.mockSamlProvider);
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;
      await fixture.controller.updateOne(
        '2',
        {
          samlConfiguration: { certificate: fixture.mockSamlProvider.samlConfiguration?.certificate },
        } as UpdateSSOProviderDto,
        request,
      );
      expect(fixture.ssoAudit.record).not.toHaveBeenCalled();
    });

    it('uses the authoritative configuration to detect same-count mapping and query-only URL changes', async () => {
      const before = {
        ...fixture.mockSSOProvider,
        oidcConfiguration: {
          ...fixture.mockSSOProvider.oidcConfiguration,
          authorizationURL: 'https://test-issuer.com/auth?tenant=one',
          roleMappings: { 'user-manager': ['admins'] },
        },
      } as SSOProvider;
      const after = {
        ...before,
        oidcConfiguration: {
          ...before.oidcConfiguration,
          authorizationURL: 'https://test-issuer.com/auth?tenant=two',
          roleMappings: { 'billing-manager': ['billing'] },
        },
      } as SSOProvider;
      jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce(before);
      jest.spyOn(fixture.ssoService, 'updateProvider').mockResolvedValueOnce(after);
      jest
        .spyOn(fixture.module.get(RbacService), 'getRoles')
        .mockResolvedValue([{ key: 'billing-manager', rolePermissions: [] }] as never);
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;

      await fixture.controller.updateOne(
        '1',
        {
          oidcConfiguration: {
            authorizationURL: after.oidcConfiguration?.authorizationURL,
            roleMappings: after.oidcConfiguration?.roleMappings,
          },
        },
        request,
      );

      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            changes: JSON.stringify({
              changed: ['configuration.authorizationURL', 'configuration.roleMappings'],
              rotated: [],
            }),
          }),
        }),
      );
    });

    it('records certificate replacement as a rotation without retaining certificate material', async () => {
      const before = fixture.mockSamlProvider;
      const after = {
        ...before,
        samlConfiguration: { ...before.samlConfiguration, certificate: 'REPLACEMENT' },
      } as SSOProvider;
      jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce(before);
      jest.spyOn(fixture.ssoService, 'updateProvider').mockResolvedValueOnce(after);
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;

      await fixture.controller.updateOne(
        '2',
        { samlConfiguration: { certificate: 'REPLACEMENT' } } as UpdateSSOProviderDto,
        request,
      );

      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            changes: JSON.stringify({ changed: [], rotated: ['identityProviderCertificate'] }),
          }),
        }),
      );
    });
  });

  describe('deleteProvider', () => {
    it('should delete a provider when user has permission', async () => {
      await fixture.controller.deleteOne('1', { user: { id: 1 } } as AuthenticatedRequest);

      expect(fixture.ssoService.deleteProvider).toHaveBeenCalledWith(1);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provider.deleted',
          actorId: 1,
          details: expect.objectContaining({ after: 'null' }),
        }),
      );
    });
  });

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

  describe('oidcLoginCallback', () => {
    let mockRequest: {
      user: { id: number; username: string; email: string };
      headers: Record<string, string>;
      ip: string;
      connection: { remoteAddress: string };
    } & Record<string, unknown>;
    let mockResponse: { cookie: jest.Mock; redirect: jest.Mock };
    let sessionService: SessionService;

    beforeEach(() => {
      sessionService = fixture.module.get<SessionService>(SessionService);

      mockRequest = {
        user: { id: 1, username: 'testuser', email: 'test@example.com' },
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
      };

      mockResponse = {
        cookie: jest.fn(),
        redirect: jest.fn(),
      };
    });

    it('should set cookie and return user data for web browser requests', async () => {
      const result = await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        undefined,
        mockResponse as unknown as Response,
      );

      expect(sessionService.createSession).toHaveBeenCalledWith(mockRequest.user, {
        userAgent: mockRequest.headers['user-agent'],
        ipAddress: mockRequest.ip,
      });

      expect(fixture.cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');

      expect(result).toEqual({
        user: mockRequest.user,
        authToken: 'mock-session-token',
      });
    });

    it('should return session token for programmatic requests', async () => {
      // Modify request to look programmatic
      mockRequest.headers.accept = 'application/json';
      mockRequest.headers['user-agent'] = 'curl/7.68.0';

      const result = await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        undefined,
        mockResponse as unknown as Response,
      );

      expect(sessionService.createSession).toHaveBeenCalledWith(mockRequest.user, {
        userAgent: mockRequest.headers['user-agent'],
        ipAddress: mockRequest.ip,
      });

      expect(mockResponse.cookie).not.toHaveBeenCalled();

      expect(result).toEqual({
        user: mockRequest.user,
        authToken: 'mock-session-token',
      });
    });

    it('records a safe successful SSO login event', async () => {
      await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        undefined,
        mockResponse as unknown as Response,
        '1',
      );

      expect(fixture.identityAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso_login',
          outcome: 'succeeded',
          actorId: 1,
          subjectId: 1,
          details: { providerId: 1 },
          request: { ipAddress: '127.0.0.1', userAgent: mockRequest.headers['user-agent'] },
        }),
      );
    });

    it('should redirect without leaking user data in URL', async () => {
      const redirectTo = 'http://localhost:3000/dashboard';

      await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        redirectTo,
        mockResponse as unknown as Response,
      );

      expect(fixture.cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');
      expect(mockResponse.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('should strip account-linking params from redirect URL', async () => {
      const redirectTo = 'http://localhost:3000/dashboard?accountLinking=true&email=test@x.com&ssoLinkToken=abc';

      await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        redirectTo,
        mockResponse as unknown as Response,
      );

      expect(mockResponse.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('should prefer redirectTo from OIDC state over query param (fixed callback URI)', async () => {
      const redirectFromState = 'https://app.example.com/from-state';
      (mockRequest as Record<string, unknown>)[SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY] = redirectFromState;

      await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        'https://app.example.com/from-query',
        mockResponse as unknown as Response,
      );

      expect(mockResponse.redirect).toHaveBeenCalledWith(expect.stringContaining(redirectFromState));
    });
  });

  it.each(['discoverAuthentik', 'discoverKeycloak'] as const)(
    'builds and validates %s discovery requests',
    async (method) => {
      const fetchMock = jest
        .spyOn(discovery, 'requestDiscoveryJson')
        .mockResolvedValue({ issuer: 'https://idp.example' });
      try {
        expect(await fixture.controller[method]('idp.example/', 'team name')).toEqual({
          issuer: 'https://idp.example',
        });
        const route = method === 'discoverAuthentik' ? 'application/o' : 'realms';
        expect(fetchMock).toHaveBeenCalledWith(
          new URL(`http://idp.example/${route}/team%20name/.well-known/openid-configuration`),
        );
        await fixture.controller[method]('https://idp.example', 'team');
        expect(fetchMock).toHaveBeenLastCalledWith(
          new URL(`https://idp.example/${route}/team/.well-known/openid-configuration`),
        );
        fetchMock.mockRejectedValue(new Error('503 Unavailable'));
        await expect(fixture.controller[method]('https://idp.example', 'team')).rejects.toThrow('503 Unavailable');
        await expect(fixture.controller[method]('', 'team')).rejects.toThrow('Missing required');
        await expect(fixture.controller[method]('idp.example', '')).rejects.toThrow('Missing required');
      } finally {
        fetchMock.mockRestore();
      }
    },
  );

  describe('sso provisioning endpoints', () => {
    it('resolves OIDC users by email only when they belong to the requested provider', async () => {
      const users = fixture.module.get<UsersService>(UsersService);
      const request = { headers: { authorization: 'Bearer test-client-secret' } } as unknown as Request;
      (users.findOne as jest.Mock).mockResolvedValue({
        id: 55,
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 1 }],
      });
      expect(await fixture.controller.oidcLogout('1', request, { email: ' user@example.com ' })).toEqual({ OK: true });
      expect(users.findOne).toHaveBeenCalledWith({ email: 'user@example.com' }, ['authenticationDetails']);
      (users.findOne as jest.Mock).mockResolvedValue({
        id: 55,
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 99 }],
      });
      await expect(fixture.controller.oidcLogout('1', request, { email: 'user@example.com' })).rejects.toThrow(
        'SSO_USER_NOT_FOUND',
      );
      await expect(fixture.controller.oidcLogout('1', request, { subject: ' ', email: ' ' })).rejects.toThrow(
        'SSO_SUBJECT_OR_EMAIL_REQUIRED',
      );
    });

    it('requires an external identity for SAML email fallback', async () => {
      const users = fixture.module.get<UsersService>(UsersService);
      jest
        .spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration')
        .mockResolvedValue(fixture.mockSamlProvider);
      const request = { headers: { authorization: 'Bearer saml-secret' } } as unknown as Request;
      (users.findOne as jest.Mock).mockResolvedValue({ id: 55, externalIdentifier: 'saml-subject' });
      expect(await fixture.controller.samlLogout('2', request, { email: 'user@example.com' })).toEqual({ OK: true });
      (users.findOne as jest.Mock).mockResolvedValue({ id: 55, externalIdentifier: null });
      await expect(fixture.controller.samlLogout('2', request, { email: 'user@example.com' })).rejects.toThrow(
        'SSO_USER_NOT_FOUND',
      );
    });

    it('revokes sessions for oidc logout requests', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const sessionService = fixture.module.get<SessionService>(SessionService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 55 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.oidcLogout('1', mockRequest as unknown as Request, { subject: 'sub-1' });

      expect(result).toEqual({ OK: true });
      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(55);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provisioning.sessions_revoked',
          actorId: null,
          subject: { type: 'user', id: 55 },
        }),
      );
    });

    it('deletes users for oidc delete requests', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 77 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.oidcDeleteUser('1', mockRequest as unknown as Request, {
        subject: 'sub-2',
      });

      expect(result).toEqual({ OK: true });
      expect(usersService.deleteOne).toHaveBeenCalledWith(77);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provisioning.user_deleted',
          actorId: null,
          subject: { type: 'user', id: 77 },
        }),
      );
    });

    it('does not sync RBAC roles when roles field is absent (incremental provisioning)', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const rbacService = fixture.module.get<RbacService>(RbacService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 88 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.oidcUpdatePermissions('1', mockRequest as unknown as Request, {
        subject: 'sub-3',
      });

      expect(result).toEqual({ OK: true });
      expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
    });

    it('maps role names using provider permission mappings', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const rbacService = fixture.module.get<RbacService>(RbacService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 99 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.oidcUpdatePermissions('1', mockRequest as unknown as Request, {
        subject: 'sub-4',
        roles: ['attraccess_admin'],
      });

      expect(result).toEqual({ OK: true });
      // 'attraccess_admin' → 'user-manager' via provider's roleMappings
      expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
        99,
        expect.arrayContaining([expect.objectContaining({ roleKey: 'user-manager' })]),
        SSOProviderType.OIDC,
        1,
      );
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provisioning.permissions_synced',
          actorId: null,
          subject: { type: 'user', id: 99 },
          details: expect.objectContaining({
            changes: JSON.stringify({ added: ['user-manager'], removed: [], updated: [] }),
          }),
        }),
      );
    });

    it('handles SAML provisioning logout', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const sessionService = fixture.module.get<SessionService>(SessionService);
      jest
        .spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration')
        .mockResolvedValueOnce(fixture.mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 101,
        externalIdentifier: 'saml-user',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.samlLogout('2', mockRequest as unknown as Request, {
        subject: 'saml-user',
      });

      expect(result).toEqual({ OK: true });
      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(101);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provisioning.sessions_revoked',
          actorId: null,
          subject: { type: 'user', id: 101 },
        }),
      );
    });

    it('handles SAML provisioning delete', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      jest
        .spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration')
        .mockResolvedValueOnce(fixture.mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 102,
        externalIdentifier: 'saml-user-2',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.samlDeleteUser('2', mockRequest as unknown as Request, {
        subject: 'saml-user-2',
      });

      expect(result).toEqual({ OK: true });
      expect(usersService.deleteOne).toHaveBeenCalledWith(102);
    });

    it('handles SAML provisioning permission updates', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const rbacService = fixture.module.get<RbacService>(RbacService);
      jest
        .spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration')
        .mockResolvedValueOnce(fixture.mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 103,
        externalIdentifier: 'saml-user-3',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.samlUpdatePermissions('2', mockRequest as unknown as Request, {
        subject: 'saml-user-3',
        roles: ['billing-role'],
      });

      expect(result).toEqual({ OK: true });
      // 'billing-role' → 'billing-manager' via SAML provider's roleMappings
      expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
        103,
        expect.arrayContaining([expect.objectContaining({ roleKey: 'billing-manager' })]),
        SSOProviderType.SAML,
        2,
      );
    });
  });
});

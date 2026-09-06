import { Test, TestingModule } from '@nestjs/testing';
import { SSOController } from './sso.controller';
import { SSOService } from './sso.service';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { AuthenticationDetail, AuthenticationType, SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { UsersService } from '../../users/users.service';
import { RbacService } from '../../rbac/rbac.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { Response, Request } from 'express';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { SSOOIDCGuard } from './oidc/oidc.guard';
import { OidcCookieStateStore } from './oidc/oidc-cookie-state-store';
import { LicenseService } from '../../../license/license.service';
import { SSOLinkTokenService } from './link-token.service';
import { SettingsService } from '../../../settings/settings.service';
import { SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY } from './oidc/oidc-cookie-state-store';
import { MetricsService } from '../../../metrics/metrics.service';

const mockMetricsService = {
  authSsoLoginTotal: { inc: jest.fn() },
  authSsoLoginFailuresTotal: { inc: jest.fn() },
};

describe('SsoController', () => {
  let controller: SSOController;
  let ssoService: SSOService;
  let module: TestingModule;
  let cookieConfigService: CookieConfigService;
  let linkTokenService: SSOLinkTokenService;

  const mockSSOProvider: SSOProvider = {
    id: 1,
    name: 'Test Provider',
    type: SSOProviderType.OIDC,
    createdAt: new Date(),
    updatedAt: new Date(),
    oidcConfiguration: {
      id: 1,
      ssoProviderId: 1,
      issuer: 'https://test-issuer.com',
      authorizationURL: 'https://test-issuer.com/auth',
      tokenURL: 'https://test-issuer.com/token',
      userInfoURL: 'https://test-issuer.com/userinfo',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      roleMappings: {
        'user-manager': ['attraccess_admin'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ssoProvider: null,
    },
  } as unknown as SSOProvider;

  const mockSamlProvider: SSOProvider = {
    id: 2,
    name: 'Test SAML Provider',
    type: SSOProviderType.SAML,
    createdAt: new Date(),
    updatedAt: new Date(),
    samlConfiguration: {
      id: 2,
      ssoProviderId: 2,
      entryPoint: 'https://idp.example.com/sso',
      issuer: 'https://sp.example.com',
      certificate: 'CERT',
      signRequest: false,
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: true,
      forceAuthn: false,
      provisioningSecret: 'saml-secret',
      roleMappings: {
        'billing-manager': ['billing-role'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ssoProvider: null,
    },
  } as unknown as SSOProvider;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            userHasSSOAuthentication: jest.fn(),
            findSSOAuthenticationDetail: jest.fn(),
            updateSSOSubject: jest.fn(),
            validateAuthenticationDetails: jest.fn(),
            findUserIdBySSO: jest.fn(),
            addAuthenticationDetails: jest.fn(),
            removeAuthenticationDetails: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn().mockResolvedValue('mock-session-token'),
            revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SSOService,
          useValue: {
            getAllProviders: jest.fn().mockResolvedValue([mockSSOProvider]),
            getProviderById: jest.fn().mockResolvedValue(mockSSOProvider),
            getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(mockSSOProvider),
            createProvider: jest.fn().mockResolvedValue(mockSSOProvider),
            updateProvider: jest.fn().mockResolvedValue(mockSSOProvider),
            deleteProvider: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findOneBySSO: jest.fn(),
            updateOne: jest.fn(),
            deleteOne: jest.fn(),
          },
        },
        {
          provide: RbacService,
          useValue: {
            syncSsoRoles: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CookieConfigService,
          useValue: {
            getConfig: jest.fn().mockReturnValue({
              name: 'auth-session',
              httpOnly: true,
              secure: false,
              sameSite: 'lax',
              maxAge: 7 * 24 * 60 * 60 * 1000,
              path: '/',
            }),
            setAuthCookie: jest.fn(),
            clearAuthCookie: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getUrl: jest.fn().mockResolvedValue('http://localhost:3000'),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: LicenseService,
          useValue: {
            verifyLicense: jest.fn().mockResolvedValue({
              valid: true,
              payload: { cfg: { modules: ['sso'], usageLimits: {} } },
            }),
          },
        },
        {
          provide: SSOLinkTokenService,
          useValue: {
            verify: jest.fn(),
            issue: jest.fn(),
          },
        },
        {
          provide: OidcCookieStateStore,
          useValue: {},
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        SSOOIDCGuard,
      ],
      controllers: [SSOController],
    }).compile();

    controller = module.get<SSOController>(SSOController);
    ssoService = module.get<SSOService>(SSOService);
    cookieConfigService = module.get<CookieConfigService>(CookieConfigService);
    linkTokenService = module.get<SSOLinkTokenService>(SSOLinkTokenService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProviders', () => {
    it('should return an array of providers', async () => {
      const result = await controller.getAll();
      expect(result).toEqual([mockSSOProvider]);
      expect(ssoService.getAllProviders).toHaveBeenCalled();
    });
  });

  describe('getProviderById', () => {
    it('should return a single provider', async () => {
      const result = await controller.getOneById('1');
      expect(result).toEqual(mockSSOProvider);
      expect(ssoService.getProviderById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if provider not found', async () => {
      jest.spyOn(ssoService, 'getProviderById').mockRejectedValueOnce(new NotFoundException());
      await expect(controller.getOneById('999')).rejects.toThrow(NotFoundException);
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

      const result = await controller.createOne(createDto, { user: { id: 1 } } as AuthenticatedRequest);

      expect(result).toEqual(mockSSOProvider);
      expect(ssoService.createProvider).toHaveBeenCalledWith(createDto);
    });
  });

  describe('updateProvider', () => {
    it('should update a provider when user has permission', async () => {
      const updateDto: UpdateSSOProviderDto = {
        name: 'Updated Provider',
      };

      // Provider without permission mappings — no ceiling check triggered.
      jest.spyOn(ssoService, 'getProviderById').mockResolvedValueOnce({
        ...mockSSOProvider,
        oidcConfiguration: { ...mockSSOProvider.oidcConfiguration, roleMappings: {} },
      } as SSOProvider);

      const mockReq = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;
      const result = await controller.updateOne('1', updateDto, mockReq);

      expect(result).toEqual(mockSSOProvider);
      expect(ssoService.updateProvider).toHaveBeenCalledWith(1, updateDto);
    });

    it('gates explicit null roleMappings behind users.roles.manage', async () => {
      const updateDto = {
        oidcConfiguration: { roleMappings: null },
      } as unknown as UpdateSSOProviderDto;

      const mockReq = { user: { id: 1, effectivePermissions: new Set<string>() } } as unknown as AuthenticatedRequest;

      await expect(controller.updateOne('1', updateDto, mockReq)).rejects.toThrow(ForbiddenException);
      expect(ssoService.updateProvider).not.toHaveBeenCalled();
    });
  });

  describe('deleteProvider', () => {
    it('should delete a provider when user has permission', async () => {
      await controller.deleteOne('1');

      expect(ssoService.deleteProvider).toHaveBeenCalledWith(1);
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
      const authService = module.get<AuthService>(AuthService);
      const usersService = module.get<UsersService>(UsersService);

      (linkTokenService.verify as jest.Mock).mockResolvedValue(payload);
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

        const result = await controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

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

        await controller.linkUserToExternalAccount({ linkToken: 'my-token', password: 'secret' });

        expect(linkTokenService.verify).toHaveBeenCalledWith('my-token');
      });

      it('looks up user by email from link payload', async () => {
        const { usersService } = setupLinkMocks();

        await controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

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

        const result = await controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

        expect(result).toEqual({ OK: true });
        expect(authService.updateSSOSubject).toHaveBeenCalledWith(20, 'sub-123');
        expect(authService.addAuthenticationDetails).not.toHaveBeenCalled();
      });

      it('still validates password before updating subject', async () => {
        const { authService } = setupLinkMocks({
          existingSSODetail: existingSSODetailSameProvider,
          passwordOk: false,
        });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'wrong' })).rejects.toThrow(
          UnauthorizedException,
        );

        expect(authService.updateSSOSubject).not.toHaveBeenCalled();
      });

      it('removes local password after re-linking', async () => {
        const { authService } = setupLinkMocks({ existingSSODetail: existingSSODetailSameProvider });

        await controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

        expect(authService.removeAuthenticationDetails).toHaveBeenCalledWith(10);
      });

      it('clears externalIdentifier after re-linking', async () => {
        const { usersService } = setupLinkMocks({ existingSSODetail: existingSSODetailSameProvider });

        await controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

        expect(usersService.updateOne).toHaveBeenCalledWith(42, { externalIdentifier: null });
      });

      it('rejects re-linking if new subject is already bound to another user', async () => {
        const { authService } = setupLinkMocks({
          existingSSODetail: existingSSODetailSameProvider,
          ssoSubjectExistsForOtherUser: true,
        });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          BadRequestException,
        );

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

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          BadRequestException,
        );

        expect(authService.addAuthenticationDetails).not.toHaveBeenCalled();
        expect(authService.updateSSOSubject).not.toHaveBeenCalled();
      });

      it('throws SSO_ALREADY_LINKED error message for cross-provider linking', async () => {
        setupLinkMocks({ existingSSODetail: existingSSODetailDifferentProvider });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          'SSO_ALREADY_LINKED',
        );
      });

      it('does not validate password when rejecting cross-provider link', async () => {
        const { authService } = setupLinkMocks({ existingSSODetail: existingSSODetailDifferentProvider });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          BadRequestException,
        );

        expect(authService.validateAuthenticationDetails).not.toHaveBeenCalled();
      });
    });

    describe('error conditions', () => {
      it('throws UnauthorizedException when user not found by email', async () => {
        setupLinkMocks({ userExists: false });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rejects when no local password is present', async () => {
        setupLinkMocks({ hasLocalPassword: false });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          BadRequestException,
        );
      });

      it('throws PASSWORD_REQUIRED when no local password exists', async () => {
        setupLinkMocks({ hasLocalPassword: false });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          'PASSWORD_REQUIRED',
        );
      });

      it('rejects when password verification fails', async () => {
        setupLinkMocks({ passwordOk: false });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('rejects when SSO subject is already linked to another user', async () => {
        setupLinkMocks({ ssoSubjectExistsForOtherUser: true });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          BadRequestException,
        );
      });

      it('throws SSO_SUBJECT_ALREADY_LINKED for subject collision', async () => {
        setupLinkMocks({ ssoSubjectExistsForOtherUser: true });

        await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
          'SSO_SUBJECT_ALREADY_LINKED',
        );
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
      sessionService = module.get<SessionService>(SessionService);

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
      const result = await controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        undefined,
        mockResponse as unknown as Response,
      );

      expect(sessionService.createSession).toHaveBeenCalledWith(mockRequest.user, {
        userAgent: mockRequest.headers['user-agent'],
        ipAddress: mockRequest.ip,
      });

      expect(cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');

      expect(result).toEqual({
        user: mockRequest.user,
        authToken: 'mock-session-token',
      });
    });

    it('should return session token for programmatic requests', async () => {
      // Modify request to look programmatic
      mockRequest.headers.accept = 'application/json';
      mockRequest.headers['user-agent'] = 'curl/7.68.0';

      const result = await controller.oidcLoginCallback(
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

    it('should redirect without leaking user data in URL', async () => {
      const redirectTo = 'http://localhost:3000/dashboard';

      await controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        redirectTo,
        mockResponse as unknown as Response,
      );

      expect(cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');
      expect(mockResponse.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('should strip account-linking params from redirect URL', async () => {
      const redirectTo = 'http://localhost:3000/dashboard?accountLinking=true&email=test@x.com&ssoLinkToken=abc';

      await controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        redirectTo,
        mockResponse as unknown as Response,
      );

      expect(mockResponse.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('should prefer redirectTo from OIDC state over query param (fixed callback URI)', async () => {
      const redirectFromState = 'https://app.example.com/from-state';
      (mockRequest as Record<string, unknown>)[SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY] = redirectFromState;

      await controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        'https://app.example.com/from-query',
        mockResponse as unknown as Response,
      );

      expect(mockResponse.redirect).toHaveBeenCalledWith(expect.stringContaining(redirectFromState));
    });
  });

  describe('sso provisioning endpoints', () => {
    it('revokes sessions for oidc logout requests', async () => {
      const usersService = module.get<UsersService>(UsersService);
      const sessionService = module.get<SessionService>(SessionService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 55 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.oidcLogout('1', mockRequest as unknown as Request, { subject: 'sub-1' });

      expect(result).toEqual({ OK: true });
      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(55);
    });

    it('deletes users for oidc delete requests', async () => {
      const usersService = module.get<UsersService>(UsersService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 77 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.oidcDeleteUser('1', mockRequest as unknown as Request, { subject: 'sub-2' });

      expect(result).toEqual({ OK: true });
      expect(usersService.deleteOne).toHaveBeenCalledWith(77);
    });

    it('does not sync RBAC roles when roles field is absent (incremental provisioning)', async () => {
      const usersService = module.get<UsersService>(UsersService);
      const rbacService = module.get<RbacService>(RbacService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 88 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.oidcUpdatePermissions('1', mockRequest as unknown as Request, {
        subject: 'sub-3',
      });

      expect(result).toEqual({ OK: true });
      expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
    });

    it('maps role names using provider permission mappings', async () => {
      const usersService = module.get<UsersService>(UsersService);
      const rbacService = module.get<RbacService>(RbacService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 99 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.oidcUpdatePermissions('1', mockRequest as unknown as Request, {
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
    });

    it('handles SAML provisioning logout', async () => {
      const usersService = module.get<UsersService>(UsersService);
      const sessionService = module.get<SessionService>(SessionService);
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValueOnce(mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 101,
        externalIdentifier: 'saml-user',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.samlLogout('2', mockRequest as unknown as Request, { subject: 'saml-user' });

      expect(result).toEqual({ OK: true });
      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(101);
    });

    it('handles SAML provisioning delete', async () => {
      const usersService = module.get<UsersService>(UsersService);
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValueOnce(mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 102,
        externalIdentifier: 'saml-user-2',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.samlDeleteUser('2', mockRequest as unknown as Request, {
        subject: 'saml-user-2',
      });

      expect(result).toEqual({ OK: true });
      expect(usersService.deleteOne).toHaveBeenCalledWith(102);
    });

    it('handles SAML provisioning permission updates', async () => {
      const usersService = module.get<UsersService>(UsersService);
      const rbacService = module.get<RbacService>(RbacService);
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValueOnce(mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 103,
        externalIdentifier: 'saml-user-3',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.samlUpdatePermissions('2', mockRequest as unknown as Request, {
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

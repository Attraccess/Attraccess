import { Test, TestingModule } from '@nestjs/testing';
import { SSOController } from './sso.controller';
import { SSOService } from './sso.service';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { AuthenticationDetail, AuthenticationType, SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { UsersService } from '../../users/users.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { Response, Request } from 'express';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { SSOOIDCGuard } from './oidc/oidc.guard';
import { LicenseService } from '../../../license/license.service';
import { SSOLinkTokenService } from './link-token.service';
import { SettingsService } from '../../../settings/settings.service';

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
      permissionMappings: {
        canManageUsers: ['attraccess_admin'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ssoProvider: null,
    },
  } as SSOProvider;

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
      permissionMappings: {
        canManageBilling: ['billing-role'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ssoProvider: null,
    },
  } as SSOProvider;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            userHasSSOAuthentication: jest.fn(),
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
            getFrontendUrl: jest.fn().mockResolvedValue('http://localhost:3000'),
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

      const result = await controller.createOne(createDto);

      expect(result).toEqual(mockSSOProvider);
      expect(ssoService.createProvider).toHaveBeenCalledWith(createDto);
    });
  });

  describe('updateProvider', () => {
    it('should update a provider when user has permission', async () => {
      const updateDto: UpdateSSOProviderDto = {
        name: 'Updated Provider',
      };

      const result = await controller.updateOne('1', updateDto);

      expect(result).toEqual(mockSSOProvider);
      expect(ssoService.updateProvider).toHaveBeenCalledWith(1, updateDto);
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
      hasSSO = false,
      passwordOk = true,
      ssoSubjectExistsForOtherUser = false,
      hasLocalPassword = true,
    } = {}) {
      const authService = module.get<AuthService>(AuthService);
      const usersService = module.get<UsersService>(UsersService);

      (linkTokenService.verify as jest.Mock).mockResolvedValue(linkPayload);
      (authService.userHasSSOAuthentication as jest.Mock | undefined)?.mockResolvedValue(hasSSO);
      (authService.validateAuthenticationDetails as jest.Mock | undefined)?.mockResolvedValue(passwordOk);
      (authService.findUserIdBySSO as jest.Mock | undefined)?.mockResolvedValue(
        ssoSubjectExistsForOtherUser ? 999 : null,
      );
      (authService.addAuthenticationDetails as jest.Mock | undefined)?.mockResolvedValue(undefined);
      (authService.removeAuthenticationDetails as jest.Mock | undefined)?.mockResolvedValue(undefined);
      (usersService.updateOne as jest.Mock | undefined)?.mockResolvedValue(undefined);

      const user = {
        ...baseUser,
        authenticationDetails: hasLocalPassword ? baseUser.authenticationDetails : [],
      };
      (usersService.findOne as jest.Mock | undefined)?.mockResolvedValue(user);

      return { authService, usersService };
    }

    it('links when password is valid, no prior SSO, and removes local password', async () => {
      const { authService, usersService } = setupLinkMocks();

      const result = await controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' });

      expect(result).toEqual({ OK: true });
      expect(authService.addAuthenticationDetails).toHaveBeenCalledWith(baseUser.id, {
        type: AuthenticationType.SSO,
        details: { providerId: 1, providerType: SSOProviderType.OIDC, subject: 'sub-123' },
      });
      expect(authService.removeAuthenticationDetails).toHaveBeenCalledWith(10);
      expect(usersService.updateOne).toHaveBeenCalledWith(baseUser.id, { externalIdentifier: null });
    });

    it('rejects when user already has SSO binding', async () => {
      setupLinkMocks({ hasSSO: true });

      await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when no local password is present', async () => {
      setupLinkMocks({ hasLocalPassword: false });

      await expect(controller.linkUserToExternalAccount({ linkToken: 'token', password: 'secret' })).rejects.toThrow(
        BadRequestException,
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

    it('should handle redirect with user data for web browsers', async () => {
      const redirectTo = 'http://localhost:3000/dashboard';

      await controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        redirectTo,
        mockResponse as unknown as Response,
      );

      expect(cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('user=' + encodeURIComponent(JSON.stringify(mockRequest.user))),
      );
    });

    it('should handle redirect with auth data for programmatic requests', async () => {
      // Modify request to look programmatic
      mockRequest.headers.accept = 'application/json';
      mockRequest.headers['user-agent'] = 'curl/7.68.0';

      const redirectTo = 'http://localhost:3000/api/callback';

      await controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        redirectTo,
        mockResponse as unknown as Response,
      );

      expect(mockResponse.cookie).not.toHaveBeenCalled();
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('user=' + encodeURIComponent(JSON.stringify(mockRequest.user))),
      );
    });
  });

  describe('sso provisioning endpoints', () => {
    it('revokes sessions for oidc logout requests', async () => {
      const usersService = module.get<UsersService>(UsersService);
      const sessionService = module.get<SessionService>(SessionService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({
        id: 55,
        systemPermissions: {},
      });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.oidcLogout('1', mockRequest as unknown as Request, { subject: 'sub-1' });

      expect(result).toEqual({ OK: true });
      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(55);
    });

    it('deletes users for oidc delete requests', async () => {
      const usersService = module.get<UsersService>(UsersService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({
        id: 77,
        systemPermissions: {},
      });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.oidcDeleteUser('1', mockRequest as unknown as Request, { subject: 'sub-2' });

      expect(result).toEqual({ OK: true });
      expect(usersService.deleteOne).toHaveBeenCalledWith(77);
    });

    it('updates permissions for oidc permission requests', async () => {
      const usersService = module.get<UsersService>(UsersService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({
        id: 88,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
      });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.oidcUpdatePermissions('1', mockRequest as unknown as Request, {
        subject: 'sub-3',
        canManageUsers: true,
        canManageBilling: true,
      });

      expect(result).toEqual({ OK: true });
      expect(usersService.updateOne).toHaveBeenCalledWith(88, {
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: true,
          canManageBilling: true,
        },
      });
    });

    it('maps role names using provider permission mappings', async () => {
      const usersService = module.get<UsersService>(UsersService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({
        id: 99,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
      });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.oidcUpdatePermissions('1', mockRequest as unknown as Request, {
        subject: 'sub-4',
        roles: ['attraccess_admin'],
      });

      expect(result).toEqual({ OK: true });
      expect(usersService.updateOne).toHaveBeenCalledWith(99, {
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: true,
          canManageBilling: false,
        },
      });
    });

    it('handles SAML provisioning logout', async () => {
      const usersService = module.get<UsersService>(UsersService);
      const sessionService = module.get<SessionService>(SessionService);
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValueOnce(mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 101,
        externalIdentifier: 'saml-user',
        authenticationDetails: [],
        systemPermissions: {},
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
        systemPermissions: {},
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.samlDeleteUser('2', mockRequest as unknown as Request, { subject: 'saml-user-2' });

      expect(result).toEqual({ OK: true });
      expect(usersService.deleteOne).toHaveBeenCalledWith(102);
    });

    it('handles SAML provisioning permission updates', async () => {
      const usersService = module.get<UsersService>(UsersService);
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValueOnce(mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 103,
        externalIdentifier: 'saml-user-3',
        authenticationDetails: [],
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await controller.samlUpdatePermissions('2', mockRequest as unknown as Request, {
        subject: 'saml-user-3',
        roles: ['billing-role'],
      });

      expect(result).toEqual({ OK: true });
      expect(usersService.updateOne).toHaveBeenCalledWith(103, {
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: true,
        },
      });
    });
  });
});

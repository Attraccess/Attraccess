import { Test, TestingModule } from '@nestjs/testing';
import { SSOController } from './sso.controller';
import { SSOService } from './sso.service';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { UsersService } from '../../users/users.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { Response } from 'express';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { SSOOIDCGuard } from './oidc/oidc.guard';

describe('SsoController', () => {
  let controller: SSOController;
  let ssoService: SSOService;
  let module: TestingModule;
  let cookieConfigService: CookieConfigService;

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
          useValue: {},
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn().mockResolvedValue('mock-session-token'),
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
          useValue: {},
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
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app') {
                return {
                  ATTRACCESS_URL: 'http://localhost:3000',
                  ATTRACCESS_FRONTEND_URL: 'http://localhost:3000',
                };
              }

              if (key === 'session') {
                return {
                  SESSION_COOKIE_MAX_AGE: 7 * 24 * 60 * 60 * 1000,
                };
              }

              return null;
            }),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn(),
          },
        },
        SSOOIDCGuard,
      ],
      controllers: [SSOController],
    }).compile();

    controller = module.get<SSOController>(SSOController);
    ssoService = module.get<SSOService>(SSOService);
    cookieConfigService = module.get<CookieConfigService>(CookieConfigService);
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
        'cookie'
      );

      expect(sessionService.createSession).toHaveBeenCalledWith(mockRequest.user, {
        userAgent: mockRequest.headers['user-agent'],
        ipAddress: mockRequest.ip,
      });

      expect(cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');

      expect(result).toEqual({
        user: mockRequest.user,
        authToken: '', // Empty for web browsers
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
        'body'
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
        'cookie'
      );

      expect(cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('user=' + encodeURIComponent(JSON.stringify(mockRequest.user)))
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
        'body'
      );

      expect(mockResponse.cookie).not.toHaveBeenCalled();
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining(
          'auth=' +
            encodeURIComponent(
              JSON.stringify({
                user: mockRequest.user,
                authToken: 'mock-session-token',
              })
            )
        )
      );
    });
  });
});

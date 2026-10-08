import { SsoLogoutService } from './sso/sso-logout.service';
import { SettingsService } from '../../settings/settings.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { User } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { CookieConfigService } from '../../common/services/cookie-config.service';
import { LoginRateLimitGuard } from '../rate-limiting/login.rate-limit.guard';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { UsersService } from '../users/users.service';
import { IdentityAuditService } from '../../audit/identity-audit.service';

const passportRequest = require('passport/lib/http/request') as {
  logout(this: object, callback: (error?: Error) => void): void;
};

describe('AuthController', () => {
  let authController: AuthController;
  let sessionService: SessionService;
  let cookieConfigService: CookieConfigService;
  let identityAudit: { record: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {},
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn().mockResolvedValue('test-session-token'),
            refreshSession: jest.fn().mockResolvedValue('new-session-token'),
            revokeSession: jest.fn(),
            revokeLogoutSession: jest.fn(),
            getLogoutSession: jest.fn().mockResolvedValue({
              id: 'stable-session',
              ssoContext: { protocol: 'OIDC', providerId: 1, issuer: 'https://idp.example', subject: 'person' },
            }),
            validateSession: jest.fn().mockResolvedValue({ id: 7 }),
            getSsoContext: jest
              .fn()
              .mockResolvedValue({ protocol: 'OIDC', providerId: 1, issuer: 'https://idp.example', subject: 'person' }),
          },
        },
        {
          provide: CookieConfigService,
          useValue: {
            getCookieName: jest.fn().mockReturnValue('auth-session'),
            setAuthCookie: jest.fn(),
            clearAuthCookie: jest.fn(),
          },
        },
        {
          provide: BruteForceProtectionService,
          useValue: {
            assertIpAllowed: jest.fn().mockResolvedValue(undefined),
            assertAccountAllowed: jest.fn().mockResolvedValue(undefined),
            recordFailure: jest.fn().mockResolvedValue(undefined),
            recordSuccess: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        {
          provide: SsoLogoutService,
          useValue: {
            prepare: jest.fn().mockResolvedValue({ kind: 'redirect', redirectUrl: 'https://idp.example/logout' }),
            returnURL: async () => 'https://app.example/',
          },
        },
        { provide: SettingsService, useValue: { getUrl: async () => 'https://app.example' } },
        { provide: IdentityAuditService, useValue: { record: jest.fn() } },
        { provide: LoginRateLimitGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    sessionService = module.get<SessionService>(SessionService);
    cookieConfigService = module.get<CookieConfigService>(CookieConfigService);
    identityAudit = module.get(IdentityAuditService);
  });

  it('should be defined', () => {
    expect(authController).toBeDefined();
  });

  it('should create a session for programmatic client', async () => {
    const user: Partial<User> = {
      id: 1,
      username: 'testuser',
    };

    const mockRequest = {
      ...Object.create(Request.prototype),
      user,
      headers: {
        accept: 'application/json',
        'user-agent': 'curl/7.68.0',
      },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    } as AuthenticatedRequest;

    const mockResponse = {
      cookie: jest.fn(),
    } as unknown as Response;

    const result = await authController.createSession(mockRequest, mockResponse, {
      tokenLocation: 'body',
    });

    expect(result).toEqual({
      authToken: 'test-session-token',
      user: {
        id: 1,
        username: 'testuser',
      },
    });
    expect(sessionService.createSession).toHaveBeenCalledWith(user, {
      userAgent: 'curl/7.68.0',
      ipAddress: '127.0.0.1',
    });
    expect(mockResponse.cookie).not.toHaveBeenCalled();
  });

  it('should create a session for web browser and set cookie', async () => {
    const user: Partial<User> = {
      id: 1,
      username: 'testuser',
    };

    const mockRequest = {
      ...Object.create(Request.prototype),
      user,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    } as AuthenticatedRequest;

    const mockResponse = {
      cookie: jest.fn(),
    } as unknown as Response;

    const result = await authController.createSession(mockRequest, mockResponse, { tokenLocation: 'cookie' });

    expect(result).toEqual({
      authToken: '',
      user: {
        id: 1,
        username: 'testuser',
      },
    });
    expect(sessionService.createSession).toHaveBeenCalledWith(user, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ipAddress: '127.0.0.1',
    });
    expect(cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'test-session-token');
  });

  it('uses Passport logout with its request receiver and awaits the audit receipt', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      jwtTokenId: 'test-jwt-token-id',
    };

    const sessionManager = {
      logOut: jest.fn((_request, _options, callback) => callback()),
    };
    const mockRequest = {
      ...Object.create(Request.prototype),
      user: mockUser,
      authSession: { id: 'stable-session', ssoContext: null },
      headers: {
        authorization: 'Bearer test-session-token',
      },
      cookies: {},
      _userProperty: 'user',
      _sessionManager: sessionManager,
      logout: passportRequest.logout,
    } as AuthenticatedRequest;

    const mockResponse = {
      clearCookie: jest.fn(),
    } as unknown as Response;

    let resolveAudit: () => void;
    identityAudit.record.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAudit = resolve;
      }),
    );
    const completed = authController.endSession(mockRequest, mockResponse);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockRequest.user).toBeNull();
    expect(sessionManager.logOut).toHaveBeenCalledWith(mockRequest, {}, expect.any(Function));
    expect(sessionService.revokeLogoutSession).toHaveBeenCalledWith('stable-session');
    expect(cookieConfigService.clearAuthCookie).toHaveBeenCalledWith(mockResponse);
    expect(identityAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'logout', actorId: 1, subjectId: 1 }),
    );
    if (!resolveAudit) throw new Error('audit receipt was not requested');
    resolveAudit();
    await completed;
  });

  it('should delete a session with cookie token', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      jwtTokenId: 'test-jwt-token-id',
    };

    const mockRequest = {
      ...Object.create(Request.prototype),
      user: mockUser,
      authSession: { id: 'stable-session', ssoContext: null },
      headers: {},
      cookies: {
        'auth-session': 'cookie-session-token',
      },
      logout: jest.fn().mockImplementation((cb) => cb()),
    } as AuthenticatedRequest;

    const mockResponse = {
      clearCookie: jest.fn(),
    } as unknown as Response;

    await authController.endSession(mockRequest, mockResponse);

    expect(mockRequest.logout).toHaveBeenCalled();
    expect(sessionService.revokeLogoutSession).toHaveBeenCalledWith('stable-session');
    expect(cookieConfigService.clearAuthCookie).toHaveBeenCalledWith(mockResponse);
  });

  it('does not record a successful logout when Passport reports a callback error', async () => {
    const logoutError = new Error('logout failed');
    const sessionManager = {
      logOut: jest.fn((_request, _options, callback) => callback(logoutError)),
    };
    const mockRequest = {
      ...Object.create(Request.prototype),
      user: { id: 1, username: 'testuser' },
      headers: {},
      cookies: {},
      _userProperty: 'user',
      _sessionManager: sessionManager,
      logout: passportRequest.logout,
    } as AuthenticatedRequest;
    const mockResponse = { clearCookie: jest.fn() } as unknown as Response;

    await expect(authController.endSession(mockRequest, mockResponse)).rejects.toThrow(logoutError);
    expect(sessionManager.logOut).toHaveBeenCalledWith(mockRequest, {}, expect.any(Function));
    expect(identityAudit.record).not.toHaveBeenCalled();
  });

  it('should refresh session for programmatic client', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
    };

    const mockRequest = {
      ...Object.create(Request.prototype),
      user: mockUser,
      headers: {
        authorization: 'Bearer current-session-token',
        accept: 'application/json',
        'user-agent': 'curl/7.68.0',
      },
      cookies: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    } as AuthenticatedRequest;

    const mockResponse = {
      cookie: jest.fn(),
    } as unknown as Response;

    const result = await authController.refreshSession(mockRequest, mockResponse, 'body');

    expect(result).toEqual({
      authToken: 'new-session-token',
      user: mockUser,
    });
    expect(sessionService.refreshSession).toHaveBeenCalledWith('current-session-token');
    expect(mockResponse.cookie).not.toHaveBeenCalled();
  });

  it('should refresh session for web browser and update cookie', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
    };

    const mockRequest = {
      ...Object.create(Request.prototype),
      user: mockUser,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      cookies: {
        'auth-session': 'current-session-token',
      },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    } as AuthenticatedRequest;

    const mockResponse = {
      cookie: jest.fn(),
    } as unknown as Response;

    const result = await authController.refreshSession(mockRequest, mockResponse, 'cookie');

    expect(result).toEqual({
      authToken: '',
      user: mockUser,
    });
    expect(sessionService.refreshSession).toHaveBeenCalledWith('current-session-token');
    expect(cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'new-session-token');
  });
  it('central logout uses the session captured during authentication before local termination', async () => {
    const request = {
      user: { id: 7 },
      authSession: { id: 'stable-session', ssoContext: null },
      headers: { authorization: 'Bearer header-session', origin: 'https://app.example' },
      cookies: { 'auth-session': 'cookie-session' },
      logout: jest.fn((done: () => void) => done()),
    } as unknown as AuthenticatedRequest;
    const response = { setHeader: jest.fn() } as unknown as Response;
    expect(await authController.logoutEverywhere(request, response)).toEqual({
      kind: 'redirect',
      redirectUrl: 'https://idp.example/logout',
    });
    expect(sessionService.getLogoutSession).not.toHaveBeenCalled();
    expect(sessionService.revokeLogoutSession).toHaveBeenCalledWith('stable-session');
    expect(cookieConfigService.clearAuthCookie).toHaveBeenCalledWith(response);
    expect(request.logout).toHaveBeenCalled();
  });

  it('always ends the local session when provider redirect preparation fails', async () => {
    const controller = new AuthController(
      sessionService,
      cookieConfigService,
      identityAudit as unknown as IdentityAuditService,
      {
        prepare: async () => {
          throw new Error('Provider unavailable');
        },
        returnURL: async () => 'https://app.example/',
      } as unknown as SsoLogoutService,
      { getUrl: async () => 'https://app.example' } as SettingsService,
    );
    const request = {
      user: { id: 7 },
      authSession: { id: 'stable-session', ssoContext: null },
      headers: {},
      cookies: { 'auth-session': 'session' },
      logout: (done: () => void) => done(),
    } as unknown as AuthenticatedRequest;
    expect(await controller.logoutEverywhere(request, { setHeader: jest.fn() } as unknown as Response)).toEqual({
      kind: 'local_only',
      reason: 'provider_failed',
    });
    expect(sessionService.revokeLogoutSession).toHaveBeenCalledWith('stable-session');
  });

  it('rejects API tokens and cross-origin central logout before revoking anything', async () => {
    const response = { setHeader: jest.fn() } as unknown as Response;
    for (const [user, headers] of [
      [{ id: 7, apiTokenId: 12 }, { authorization: 'Bearer api-token' }],
      [{ id: 7 }, { authorization: 'Bearer session', origin: 'https://attacker.example' }],
    ]) {
      const request = {
        user,
        authSession: { id: 'stable-session', ssoContext: null },
        headers,
        cookies: {},
        logout: jest.fn(),
      } as unknown as AuthenticatedRequest;
      await expect(authController.logoutEverywhere(request, response)).rejects.toThrow();
    }
    expect(sessionService.revokeSession).not.toHaveBeenCalled();
    expect(sessionService.revokeLogoutSession).not.toHaveBeenCalled();
  });

  it('does not create a new session when refresh loses a race with logout', async () => {
    jest.spyOn(sessionService, 'refreshSession').mockResolvedValue(null);
    const request = {
      user: { id: 7 },
      authSession: { id: 'stable-session', ssoContext: null },
      headers: { authorization: 'Bearer ended-session' },
      cookies: {},
    } as unknown as AuthenticatedRequest;
    await expect(authController.refreshSession(request, {} as Response, 'body')).rejects.toThrow('ended or expired');
    expect(sessionService.createSession).not.toHaveBeenCalled();
  });
});

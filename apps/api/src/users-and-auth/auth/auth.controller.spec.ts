import { registerAuthControllerFixture } from './auth.controller.auth-controller.test-fixture';
import { Response } from 'express';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { User } from '@attraccess/database-entities';

describe('AuthController', () => {
  const fixture = registerAuthControllerFixture();

  it('should be defined', () => {
    expect(fixture.authController).toBeDefined();
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

    const result = await fixture.authController.createSession(mockRequest, mockResponse, {
      tokenLocation: 'body',
    });

    expect(result).toEqual({
      authToken: 'test-session-token',
      user: {
        id: 1,
        username: 'testuser',
      },
    });
    expect(fixture.sessionService.createSession).toHaveBeenCalledWith(user, {
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

    const result = await fixture.authController.createSession(mockRequest, mockResponse, { tokenLocation: 'cookie' });

    expect(result).toEqual({
      authToken: '',
      user: {
        id: 1,
        username: 'testuser',
      },
    });
    expect(fixture.sessionService.createSession).toHaveBeenCalledWith(user, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ipAddress: '127.0.0.1',
    });
    expect(fixture.cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'test-session-token');
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
      headers: {
        authorization: 'Bearer test-session-token',
      },
      cookies: {},
      _userProperty: 'user',
      _sessionManager: sessionManager,
      logout: fixture.passportRequest.logout,
    } as AuthenticatedRequest;

    const mockResponse = {
      clearCookie: jest.fn(),
    } as unknown as Response;

    let resolveAudit: () => void;
    fixture.identityAudit.record.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAudit = resolve;
      }),
    );
    const completed = fixture.authController.endSession(mockRequest, mockResponse);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockRequest.user).toBeNull();
    expect(sessionManager.logOut).toHaveBeenCalledWith(mockRequest, {}, expect.any(Function));
    expect(fixture.sessionService.revokeSession).toHaveBeenCalledWith('test-session-token');
    expect(fixture.cookieConfigService.clearAuthCookie).toHaveBeenCalledWith(mockResponse);
    expect(fixture.identityAudit.record).toHaveBeenCalledWith(
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
      headers: {},
      cookies: {
        'auth-session': 'cookie-session-token',
      },
      logout: jest.fn().mockImplementation((cb) => cb()),
    } as AuthenticatedRequest;

    const mockResponse = {
      clearCookie: jest.fn(),
    } as unknown as Response;

    await fixture.authController.endSession(mockRequest, mockResponse);

    expect(mockRequest.logout).toHaveBeenCalled();
    expect(fixture.sessionService.revokeSession).toHaveBeenCalledWith('cookie-session-token');
    expect(fixture.cookieConfigService.clearAuthCookie).toHaveBeenCalledWith(mockResponse);
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
      logout: fixture.passportRequest.logout,
    } as AuthenticatedRequest;
    const mockResponse = { clearCookie: jest.fn() } as unknown as Response;

    await expect(fixture.authController.endSession(mockRequest, mockResponse)).rejects.toThrow(logoutError);
    expect(sessionManager.logOut).toHaveBeenCalledWith(mockRequest, {}, expect.any(Function));
    expect(fixture.identityAudit.record).not.toHaveBeenCalled();
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

    const result = await fixture.authController.refreshSession(mockRequest, mockResponse, 'body');

    expect(result).toEqual({
      authToken: 'new-session-token',
      user: mockUser,
    });
    expect(fixture.sessionService.refreshSession).toHaveBeenCalledWith('current-session-token');
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

    const result = await fixture.authController.refreshSession(mockRequest, mockResponse, 'cookie');

    expect(result).toEqual({
      authToken: '',
      user: mockUser,
    });
    expect(fixture.sessionService.refreshSession).toHaveBeenCalledWith('current-session-token');
    expect(fixture.cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'new-session-token');
  });
});

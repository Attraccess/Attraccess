import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { User } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { CookieConfigService } from '../../common/services/cookie-config.service';

describe('AuthController', () => {
  let authController: AuthController;
  let sessionService: SessionService;
  let cookieConfigService: CookieConfigService;

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
          },
        },
        {
          provide: CookieConfigService,
          useValue: {
            getConfig: jest.fn().mockReturnValue({
              name: 'auth-session',
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              maxAge: 24 * 60 * 60 * 1000,
              path: '/',
            }),
            setAuthCookie: jest.fn(),
            clearAuthCookie: jest.fn(),
          },
        },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    sessionService = module.get<SessionService>(SessionService);
    cookieConfigService = module.get<CookieConfigService>(CookieConfigService);
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

  it('should delete a session and revoke session token', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      jwtTokenId: 'test-jwt-token-id',
    };

    const mockRequest = {
      ...Object.create(Request.prototype),
      user: mockUser,
      headers: {
        authorization: 'Bearer test-session-token',
      },
      cookies: {},
      logout: jest.fn().mockImplementation((cb) => cb()),
    } as AuthenticatedRequest;

    const mockResponse = {
      clearCookie: jest.fn(),
    } as unknown as Response;

    await authController.endSession(mockRequest, mockResponse);

    expect(mockRequest.logout).toHaveBeenCalled();
    expect(sessionService.revokeSession).toHaveBeenCalledWith('test-session-token');
    expect(cookieConfigService.clearAuthCookie).toHaveBeenCalledWith(mockResponse);
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

    await authController.endSession(mockRequest, mockResponse);

    expect(mockRequest.logout).toHaveBeenCalled();
    expect(sessionService.revokeSession).toHaveBeenCalledWith('cookie-session-token');
    expect(cookieConfigService.clearAuthCookie).toHaveBeenCalledWith(mockResponse);
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
});

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SessionStrategy } from './session.strategy';
import { SessionService } from '../auth/session.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { TwoFactorPolicy } from '../auth/two-factor.dto';
import { User } from '@attraccess/database-entities';
import { RbacService } from '../rbac/rbac.service';

describe('SessionStrategy', () => {
  let strategy: SessionStrategy;
  let sessionService: jest.Mocked<SessionService>;
  let twoFactorService: jest.Mocked<TwoFactorService>;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
  } as User;

  beforeEach(async () => {
    const mockSessionService = {
      validateSession: jest.fn(),
    };
    const mockTwoFactorService = {
      getStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionStrategy,
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
        {
          provide: TwoFactorService,
          useValue: mockTwoFactorService,
        },
        {
          provide: RbacService,
          useValue: { getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()) },
        },
      ],
    }).compile();

    strategy = module.get<SessionStrategy>(SessionStrategy);
    sessionService = module.get(SessionService);
    twoFactorService = module.get(TwoFactorService);
    twoFactorService.getStatus.mockResolvedValue({
      enabled: true,
      required: false,
      policy: TwoFactorPolicy.OPTIONAL,
    });
  });

  describe('validate', () => {
    it('should validate user with valid session token from Authorization header', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-session-token',
        },
        cookies: {},
        path: '/api/users/me',
      } as Request;

      sessionService.validateSession.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockRequest);

      expect(result).toEqual(mockUser);
      expect(sessionService.validateSession).toHaveBeenCalledWith('valid-session-token');
    });

    it('should validate user with valid session token from cookie', async () => {
      const mockRequest = {
        headers: {},
        cookies: {
          'auth-session': 'valid-session-token',
        },
        path: '/api/users/me',
      } as Request;

      sessionService.validateSession.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockRequest);

      expect(result).toEqual(mockUser);
      expect(sessionService.validateSession).toHaveBeenCalledWith('valid-session-token');
    });

    it('should prioritize Authorization header over cookie', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer header-token',
        },
        cookies: {
          'auth-session': 'cookie-token',
        },
        path: '/api/users/me',
      } as Request;

      sessionService.validateSession.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockRequest);

      expect(result).toEqual(mockUser);
      expect(sessionService.validateSession).toHaveBeenCalledWith('header-token');
    });

    it('should throw UnauthorizedException when no token is provided', async () => {
      const mockRequest = {
        headers: {},
        cookies: {},
      } as Request;

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('No session token provided')
      );

      expect(sessionService.validateSession).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when session is invalid', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer invalid-token',
        },
        cookies: {},
        path: '/api/users/me',
      } as Request;

      sessionService.validateSession.mockResolvedValue(null);

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired session')
      );

      expect(sessionService.validateSession).toHaveBeenCalledWith('invalid-token');
    });

    it('should handle malformed Authorization header', async () => {
      const mockRequest = {
        headers: {
          authorization: 'InvalidFormat',
        },
        cookies: {},
      } as Request;

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('No session token provided')
      );

      expect(sessionService.validateSession).not.toHaveBeenCalled();
    });

    it('should handle empty Bearer token', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer ',
        },
        cookies: {},
      } as Request;

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('No session token provided')
      );

      expect(sessionService.validateSession).not.toHaveBeenCalled();
    });

    it('should handle session service throwing error', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
        cookies: {},
        path: '/api/users/me',
      } as Request;

      sessionService.validateSession.mockRejectedValue(new Error('Database error'));

      await expect(strategy.validate(mockRequest)).rejects.toThrow('Database error');

      expect(sessionService.validateSession).toHaveBeenCalledWith('valid-token');
    });

    it('should block access when 2FA setup is required', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
        cookies: {},
        path: '/api/resources',
      } as Request;

      sessionService.validateSession.mockResolvedValue(mockUser);
      twoFactorService.getStatus.mockResolvedValue({
        enabled: false,
        required: true,
        policy: TwoFactorPolicy.REQUIRED_FOR_ALL,
      });

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new ForbiddenException('TwoFactorSetupRequired')
      );
    });
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SessionStrategy } from './session.strategy';
import { SessionService } from '../auth/session.service';
import { User } from '@attraccess/database-entities';

describe('SessionStrategy', () => {
  let strategy: SessionStrategy;
  let sessionService: jest.Mocked<SessionService>;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
  } as User;

  beforeEach(async () => {
    const mockSessionService = {
      validateSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionStrategy,
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
      ],
    }).compile();

    strategy = module.get<SessionStrategy>(SessionStrategy);
    sessionService = module.get(SessionService);
  });

  describe('validate', () => {
    it('should validate user with valid session token from Authorization header', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-session-token',
        },
        cookies: {},
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
      } as Request;

      sessionService.validateSession.mockRejectedValue(new Error('Database error'));

      await expect(strategy.validate(mockRequest)).rejects.toThrow('Database error');

      expect(sessionService.validateSession).toHaveBeenCalledWith('valid-token');
    });
  });
});
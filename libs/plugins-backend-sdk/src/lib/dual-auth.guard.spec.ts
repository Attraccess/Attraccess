import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DualAuthGuard } from './dual-auth.guard';
import { User } from '@attraccess/database-entities';

describe('DualAuthGuard', () => {
  let guard: DualAuthGuard;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    systemPermissions: {},
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DualAuthGuard],
    }).compile();

    guard = module.get<DualAuthGuard>(DualAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let mockContext: ExecutionContext;
    let mockRequest: { headers: Record<string, string>; cookies: Record<string, string> };

    beforeEach(() => {
      mockRequest = {
        headers: {},
        cookies: {},
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: jest.fn(),
          getNext: jest.fn(),
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
        getType: jest.fn(),
      } as ExecutionContext;
    });

    it('should call parent canActivate and return result', async () => {
      // Mock the parent canActivate method
      const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
      parentCanActivate.mockResolvedValue(true);

      const result = await guard.canActivate(mockContext);
      
      expect(result).toBe(true);
      expect(parentCanActivate).toHaveBeenCalledWith(mockContext);
    });

    it('should handle UnauthorizedException from parent and re-throw with consistent message', async () => {
      const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
      parentCanActivate.mockRejectedValue(new UnauthorizedException('Original error'));

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new UnauthorizedException('Authentication required')
      );
    });

    it('should re-throw non-UnauthorizedException errors', async () => {
      const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
      const customError = new Error('Custom error');
      parentCanActivate.mockRejectedValue(customError);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(customError);
    });

    describe('authentication scenarios', () => {
      it('should authenticate successfully with valid Authorization header', async () => {
        mockRequest.headers.authorization = 'Bearer valid-session-token';
        
        const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
        parentCanActivate.mockResolvedValue(true);

        const result = await guard.canActivate(mockContext);
        
        expect(result).toBe(true);
        expect(parentCanActivate).toHaveBeenCalledWith(mockContext);
      });

      it('should authenticate successfully with valid session cookie', async () => {
        mockRequest.cookies['auth-session'] = 'valid-session-token';
        
        const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
        parentCanActivate.mockResolvedValue(true);

        const result = await guard.canActivate(mockContext);
        
        expect(result).toBe(true);
        expect(parentCanActivate).toHaveBeenCalledWith(mockContext);
      });

      it('should prioritize Authorization header over cookie', async () => {
        mockRequest.headers.authorization = 'Bearer header-token';
        mockRequest.cookies['auth-session'] = 'cookie-token';
        
        const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
        parentCanActivate.mockResolvedValue(true);

        const result = await guard.canActivate(mockContext);
        
        expect(result).toBe(true);
        expect(parentCanActivate).toHaveBeenCalledWith(mockContext);
      });

      it('should fail authentication when no token is provided', async () => {
        const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
        parentCanActivate.mockRejectedValue(new UnauthorizedException('No session token provided'));

        await expect(guard.canActivate(mockContext)).rejects.toThrow(
          new UnauthorizedException('Authentication required')
        );
      });

      it('should fail authentication with malformed Authorization header', async () => {
        mockRequest.headers.authorization = 'InvalidFormat token';
        
        const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
        parentCanActivate.mockRejectedValue(new UnauthorizedException('No session token provided'));

        await expect(guard.canActivate(mockContext)).rejects.toThrow(
          new UnauthorizedException('Authentication required')
        );
      });

      it('should fail authentication with expired session token', async () => {
        mockRequest.headers.authorization = 'Bearer expired-token';
        
        const parentCanActivate = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate');
        parentCanActivate.mockRejectedValue(new UnauthorizedException('Invalid or expired session'));

        await expect(guard.canActivate(mockContext)).rejects.toThrow(
          new UnauthorizedException('Authentication required')
        );
      });
    });
  });

  describe('handleRequest', () => {
    let mockContext: ExecutionContext;
    let mockRequest: { headers: Record<string, string>; cookies: Record<string, string> };

    beforeEach(() => {
      mockRequest = {
        headers: {},
        cookies: {},
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: jest.fn(),
          getNext: jest.fn(),
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
        getType: jest.fn(),
      } as ExecutionContext;
    });

    it('should return user when authentication is successful', () => {
      const result = guard.handleRequest(null, mockUser, null, mockContext);
      expect(result).toBe(mockUser);
    });

    it('should throw UnauthorizedException with specific message for invalid header token', () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';
      
      expect(() => {
        guard.handleRequest(new Error('Invalid token'), null, null, mockContext);
      }).toThrow(new UnauthorizedException('Invalid or expired authorization token'));
    });

    it('should throw UnauthorizedException with specific message for invalid cookie', () => {
      mockRequest.cookies['auth-session'] = 'invalid-cookie-token';
      
      expect(() => {
        guard.handleRequest(new Error('Invalid token'), null, null, mockContext);
      }).toThrow(new UnauthorizedException('Invalid or expired session cookie'));
    });

    it('should throw generic UnauthorizedException when no authentication method is present', () => {
      expect(() => {
        guard.handleRequest(new Error('No auth'), null, null, mockContext);
      }).toThrow(new UnauthorizedException('Authentication required'));
    });

    it('should throw UnauthorizedException when user is null', () => {
      expect(() => {
        guard.handleRequest(null, null, null, mockContext);
      }).toThrow(new UnauthorizedException('Authentication required'));
    });

    describe('error message specificity', () => {
      it('should provide specific error for Authorization header when both header and cookie are present', () => {
        mockRequest.headers.authorization = 'Bearer invalid-token';
        mockRequest.cookies['auth-session'] = 'some-cookie-token';
        
        expect(() => {
          guard.handleRequest(new Error('Invalid token'), null, null, mockContext);
        }).toThrow(new UnauthorizedException('Invalid or expired authorization token'));
      });

      it('should provide cookie-specific error when only cookie is present', () => {
        mockRequest.cookies['auth-session'] = 'invalid-cookie-token';
        
        expect(() => {
          guard.handleRequest(new Error('Invalid token'), null, null, mockContext);
        }).toThrow(new UnauthorizedException('Invalid or expired session cookie'));
      });

      it('should handle empty Authorization header gracefully', () => {
        mockRequest.headers.authorization = '';
        mockRequest.cookies['auth-session'] = 'cookie-token';
        
        expect(() => {
          guard.handleRequest(new Error('Invalid token'), null, null, mockContext);
        }).toThrow(new UnauthorizedException('Invalid or expired session cookie'));
      });

      it('should handle malformed Authorization header gracefully', () => {
        mockRequest.headers.authorization = 'NotBearer token';
        mockRequest.cookies['auth-session'] = 'cookie-token';
        
        expect(() => {
          guard.handleRequest(new Error('Invalid token'), null, null, mockContext);
        }).toThrow(new UnauthorizedException('Invalid or expired session cookie'));
      });

      it('should handle empty cookie gracefully', () => {
        mockRequest.headers.authorization = 'Bearer valid-token';
        mockRequest.cookies['auth-session'] = '';
        
        expect(() => {
          guard.handleRequest(new Error('Invalid token'), null, null, mockContext);
        }).toThrow(new UnauthorizedException('Invalid or expired authorization token'));
      });
    });

    describe('successful authentication scenarios', () => {
      it('should return user with valid Authorization header', () => {
        mockRequest.headers.authorization = 'Bearer valid-token';
        
        const result = guard.handleRequest(null, mockUser, null, mockContext);
        expect(result).toBe(mockUser);
      });

      it('should return user with valid session cookie', () => {
        mockRequest.cookies['auth-session'] = 'valid-cookie-token';
        
        const result = guard.handleRequest(null, mockUser, null, mockContext);
        expect(result).toBe(mockUser);
      });

      it('should return user when both header and cookie are valid (header takes priority)', () => {
        mockRequest.headers.authorization = 'Bearer valid-header-token';
        mockRequest.cookies['auth-session'] = 'valid-cookie-token';
        
        const result = guard.handleRequest(null, mockUser, null, mockContext);
        expect(result).toBe(mockUser);
      });
    });
  });
});
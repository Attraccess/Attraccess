import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SessionStrategy } from './session.strategy';
import { SessionService } from '../auth/session.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { TwoFactorPolicy } from '../auth/two-factor.dto';
import { User } from '@attraccess/database-entities';
import { RbacService } from '../rbac/rbac.service';
import { ApiTokenService } from '../auth/api-token/api-token.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { SessionPermissionSync } from '../auth/sso/session-permission-sync';

describe('SessionStrategy', () => {
  let strategy: SessionStrategy;
  let sessionService: jest.Mocked<SessionService>;
  let twoFactorService: jest.Mocked<TwoFactorService>;
  let apiTokenService: jest.Mocked<ApiTokenService>;
  let rbacService: jest.Mocked<RbacService>;
  let ssoPermissionSync: { syncIfDue: jest.Mock };

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
  } as User;

  const buildModule = async (withSync: boolean) => {
    const mockSessionService = {
      authenticateSession: jest.fn(),
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
        {
          provide: ApiTokenService,
          useValue: { authenticate: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: AuthAuditLogger,
          useValue: { log: jest.fn() },
        },
        ...(withSync ? [{ provide: SessionPermissionSync, useValue: ssoPermissionSync }] : []),
      ],
    }).compile();

    strategy = module.get<SessionStrategy>(SessionStrategy);
    sessionService = module.get(SessionService);
    twoFactorService = module.get(TwoFactorService);
    apiTokenService = module.get(ApiTokenService);
    rbacService = module.get(RbacService);
    twoFactorService.getStatus.mockResolvedValue({
      enabled: true,
      required: false,
      policy: TwoFactorPolicy.OPTIONAL,
    });
  };

  beforeEach(async () => {
    ssoPermissionSync = { syncIfDue: jest.fn().mockResolvedValue('skipped') };
    await buildModule(true);
  });

  describe('validate', () => {
    it('restricts API token permissions to the owner current permissions', async () => {
      const mockRequest = {
        headers: { authorization: 'Bearer api-token' },
        cookies: {},
        path: '/api/resources',
      } as Request;
      apiTokenService.authenticate.mockResolvedValue({
        user: mockUser,
        apiToken: { id: 4, permissionKeys: ['resources.read', 'resources.write'] },
      } as never);
      rbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.read', 'users.api-tokens.manage']));

      const result = (await strategy.validate(mockRequest)) as AuthenticatedUser;

      expect(Array.from(result.effectivePermissions ?? [])).toEqual(['resources.read']);
      expect(result.authenticationMethod).toBe('api-token');
      expect(result.apiTokenId).toBe(4);
      expect(rbacService.getEffectivePermissions).toHaveBeenCalledWith(mockUser.id, true);
      expect(twoFactorService.getStatus).not.toHaveBeenCalled();
    });

    it('rejects API tokens when the owner loses API token management permission', async () => {
      const mockRequest = {
        headers: { authorization: 'Bearer api-token' },
        cookies: {},
        path: '/api/resources',
      } as Request;
      apiTokenService.authenticate.mockResolvedValue({
        user: mockUser,
        apiToken: { id: 4, permissionKeys: ['resources.read'] },
      } as never);
      rbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.read']));

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('API token permission revoked'),
      );
      expect(rbacService.getEffectivePermissions).toHaveBeenCalledWith(mockUser.id, true);
    });

    it('should validate user with valid session token from Authorization header', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-session-token',
        },
        cookies: {},
        path: '/api/users/me',
      } as Request;

      sessionService.authenticateSession.mockResolvedValue({
        user: mockUser,
        session: { id: 'stable-session', ssoContext: null },
      });

      const result = await strategy.validate(mockRequest);

      expect(result).toEqual(mockUser);
      expect(sessionService.authenticateSession).toHaveBeenCalledWith('valid-session-token');
    });

    it('should validate user with valid session token from cookie', async () => {
      const mockRequest = {
        headers: {},
        cookies: {
          'auth-session': 'valid-session-token',
        },
        path: '/api/users/me',
      } as Request;

      sessionService.authenticateSession.mockResolvedValue({
        user: mockUser,
        session: { id: 'stable-session', ssoContext: null },
      });

      const result = await strategy.validate(mockRequest);

      expect(result).toEqual(mockUser);
      expect(sessionService.authenticateSession).toHaveBeenCalledWith('valid-session-token');
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

      sessionService.authenticateSession.mockResolvedValue({
        user: mockUser,
        session: { id: 'stable-session', ssoContext: null },
      });

      const result = await strategy.validate(mockRequest);

      expect(result).toEqual(mockUser);
      expect(sessionService.authenticateSession).toHaveBeenCalledWith('header-token');
    });

    it('should throw UnauthorizedException when no token is provided', async () => {
      const mockRequest = {
        headers: {},
        cookies: {},
      } as Request;

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('No session token provided'),
      );

      expect(sessionService.authenticateSession).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when session is invalid', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer invalid-token',
        },
        cookies: {},
        path: '/api/users/me',
      } as Request;

      sessionService.authenticateSession.mockResolvedValue(null);

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired session'),
      );

      expect(sessionService.authenticateSession).toHaveBeenCalledWith('invalid-token');
    });

    it('should handle malformed Authorization header', async () => {
      const mockRequest = {
        headers: {
          authorization: 'InvalidFormat',
        },
        cookies: {},
      } as Request;

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('No session token provided'),
      );

      expect(sessionService.authenticateSession).not.toHaveBeenCalled();
    });

    it('should handle empty Bearer token', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer ',
        },
        cookies: {},
      } as Request;

      await expect(strategy.validate(mockRequest)).rejects.toThrow(
        new UnauthorizedException('No session token provided'),
      );

      expect(sessionService.authenticateSession).not.toHaveBeenCalled();
    });

    it('should handle session service throwing error', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
        cookies: {},
        path: '/api/users/me',
      } as Request;

      sessionService.authenticateSession.mockRejectedValue(new Error('Database error'));

      await expect(strategy.validate(mockRequest)).rejects.toThrow('Database error');

      expect(sessionService.authenticateSession).toHaveBeenCalledWith('valid-token');
    });

    it('should block access when 2FA setup is required', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
        cookies: {},
        path: '/api/resources',
      } as Request;

      sessionService.authenticateSession.mockResolvedValue({
        user: mockUser,
        session: { id: 'stable-session', ssoContext: null },
      });
      twoFactorService.getStatus.mockResolvedValue({
        enabled: false,
        required: true,
        policy: TwoFactorPolicy.REQUIRED_FOR_ALL,
      });

      await expect(strategy.validate(mockRequest)).rejects.toThrow(new ForbiddenException('TwoFactorSetupRequired'));
    });

    describe('SSO permission re-sync', () => {
      const session = { id: 'stable-session', ssoContext: null };
      const sessionRequest = () =>
        ({
          headers: { authorization: 'Bearer valid-session-token' },
          cookies: {},
          path: '/api/users/me',
        }) as Request;

      beforeEach(() => {
        sessionService.authenticateSession.mockResolvedValue({ user: mockUser, session } as never);
      });

      it('calls syncIfDue with the session and user id without force', async () => {
        await strategy.validate(sessionRequest());

        expect(ssoPermissionSync.syncIfDue).toHaveBeenCalledTimes(1);
        expect(ssoPermissionSync.syncIfDue).toHaveBeenCalledWith(session, mockUser.id);
      });

      it('rejects revoked sessions before computing effective permissions', async () => {
        ssoPermissionSync.syncIfDue.mockResolvedValue('revoked');

        await expect(strategy.validate(sessionRequest())).rejects.toThrow(UnauthorizedException);
        expect(rbacService.getEffectivePermissions).not.toHaveBeenCalled();
        expect(twoFactorService.getStatus).not.toHaveBeenCalled();
      });

      it.each(['updated', 'unchanged', 'skipped', 'failed'])(
        'passes through when the outcome is %s',
        async (outcome) => {
          ssoPermissionSync.syncIfDue.mockResolvedValue(outcome);

          const result = await strategy.validate(sessionRequest());

          expect(result).toEqual(mockUser);
          expect(rbacService.getEffectivePermissions).toHaveBeenCalledWith(mockUser.id);
        },
      );

      it('still validates when no SessionPermissionSync is provided', async () => {
        await buildModule(false);
        sessionService.authenticateSession.mockResolvedValue({ user: mockUser, session } as never);

        const result = await strategy.validate(sessionRequest());

        expect(result).toEqual(mockUser);
      });
    });
  });
});

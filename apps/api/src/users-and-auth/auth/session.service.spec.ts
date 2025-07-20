import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { SessionService, SessionMetadata } from './session.service';
import { Session, User } from '@attraccess/database-entities';

describe('SessionService', () => {
  let service: SessionService;
  let sessionRepository: jest.Mocked<Repository<Session>>;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    isEmailVerified: true,
    emailVerificationToken: null,
    emailVerificationTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    systemPermissions: {
      canManageResources: false,
      canManageSystemConfiguration: false,
      canManageUsers: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    resourceIntroductions: [],
    resourceUsages: [],
    authenticationDetails: [],
    resourceIntroducerPermissions: [],
    externalIdentifier: null,
    nfcCards: [],
    sessions: [],
  };

  const mockSession: Session = {
    id: 1,
    token: 'test-token-123',
    userId: 1,
    userAgent: 'Mozilla/5.0 Test Browser',
    ipAddress: '192.168.1.100',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    user: mockUser,
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: getRepositoryToken(Session),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    sessionRepository = module.get(getRepositoryToken(Session));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('should create a session with default expiration', async () => {
      const createdSession = { ...mockSession };
      sessionRepository.create.mockReturnValue(createdSession);
      sessionRepository.save.mockResolvedValue(createdSession);

      const token = await service.createSession(mockUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(sessionRepository.create).toHaveBeenCalledWith({
        token: expect.any(String),
        userId: mockUser.id,
        userAgent: null,
        ipAddress: null,
        expiresAt: expect.any(Date),
      });
      expect(sessionRepository.save).toHaveBeenCalledWith(createdSession);
    });

    it('should create a session with metadata', async () => {
      const metadata: SessionMetadata = {
        userAgent: 'Test Browser',
        ipAddress: '192.168.1.100',
        expiresIn: 3600, // 1 hour
      };
      const createdSession = { ...mockSession };
      sessionRepository.create.mockReturnValue(createdSession);
      sessionRepository.save.mockResolvedValue(createdSession);

      const token = await service.createSession(mockUser, metadata);

      expect(token).toBeDefined();
      expect(sessionRepository.create).toHaveBeenCalledWith({
        token: expect.any(String),
        userId: mockUser.id,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt: expect.any(Date),
      });
    });

    it('should limit expiration to maximum allowed time', async () => {
      const metadata: SessionMetadata = {
        expiresIn: 200 * 3600, // 200 hours (exceeds 168 hour limit)
      };
      const createdSession = { ...mockSession };
      sessionRepository.create.mockReturnValue(createdSession);
      sessionRepository.save.mockResolvedValue(createdSession);

      await service.createSession(mockUser, metadata);

      const createCall = sessionRepository.create.mock.calls[0][0];
      const expiresAt = createCall.expiresAt as Date;
      const maxExpectedTime = Date.now() + 168 * 3600 * 1000; // 168 hours
      const minExpectedTime = Date.now() + 167 * 3600 * 1000; // Allow some tolerance

      expect(expiresAt.getTime()).toBeLessThanOrEqual(maxExpectedTime);
      expect(expiresAt.getTime()).toBeGreaterThan(minExpectedTime);
    });

    it('should generate unique tokens', async () => {
      const createdSession = { ...mockSession };
      sessionRepository.create.mockReturnValue(createdSession);
      sessionRepository.save.mockResolvedValue(createdSession);

      const token1 = await service.createSession(mockUser);
      const token2 = await service.createSession(mockUser);

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateSession', () => {
    it('should return null for empty token', async () => {
      const result = await service.validateSession('');
      expect(result).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.validateSession('non-existent-token');

      expect(result).toBeNull();
      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { token: 'non-existent-token' },
        relations: ['user'],
      });
    });

    it('should return user for valid session', async () => {
      const validSession = { ...mockSession };
      sessionRepository.findOne.mockResolvedValue(validSession);
      sessionRepository.save.mockResolvedValue(validSession);

      const result = await service.validateSession('valid-token');

      expect(result).toBe(mockUser);
      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { token: 'valid-token' },
        relations: ['user'],
      });
      expect(sessionRepository.save).toHaveBeenCalledWith(validSession);
    });

    it('should remove and return null for expired session', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      };
      sessionRepository.findOne.mockResolvedValue(expiredSession);
      sessionRepository.remove.mockResolvedValue(expiredSession);

      const result = await service.validateSession('expired-token');

      expect(result).toBeNull();
      expect(sessionRepository.remove).toHaveBeenCalledWith(expiredSession);
    });

    it('should update lastAccessedAt for valid session', async () => {
      const validSession = { ...mockSession };
      const originalLastAccessed = validSession.lastAccessedAt;
      sessionRepository.findOne.mockResolvedValue(validSession);
      sessionRepository.save.mockResolvedValue(validSession);

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.validateSession('valid-token');

      expect(sessionRepository.save).toHaveBeenCalled();
      const savedSession = sessionRepository.save.mock.calls[0][0] as Session;
      expect(savedSession.lastAccessedAt.getTime()).toBeGreaterThan(originalLastAccessed.getTime());
    });
  });

  describe('refreshSession', () => {
    it('should return null for empty token', async () => {
      const result = await service.refreshSession('');
      expect(result).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.refreshSession('non-existent-token');

      expect(result).toBeNull();
    });

    it('should remove expired session and return null', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      };
      sessionRepository.findOne.mockResolvedValue(expiredSession);
      sessionRepository.remove.mockResolvedValue(expiredSession);

      const result = await service.refreshSession('expired-token');

      expect(result).toBeNull();
      expect(sessionRepository.remove).toHaveBeenCalledWith(expiredSession);
    });

    it('should refresh valid session with new token', async () => {
      const validSession = { ...mockSession };
      const originalToken = validSession.token;
      sessionRepository.findOne.mockResolvedValue(validSession);
      sessionRepository.save.mockResolvedValue(validSession);

      const newToken = await service.refreshSession('valid-token');

      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(originalToken);
      expect(sessionRepository.save).toHaveBeenCalled();

      const savedSession = sessionRepository.save.mock.calls[0][0] as Session;
      expect(savedSession.token).toBe(newToken);
      expect(savedSession.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('revokeSession', () => {
    it('should handle empty token gracefully', async () => {
      await service.revokeSession('');
      expect(sessionRepository.delete).not.toHaveBeenCalled();
    });

    it('should delete session by token', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.revokeSession('token-to-revoke');

      expect(sessionRepository.delete).toHaveBeenCalledWith({ token: 'token-to-revoke' });
    });

    it('should handle non-existent session gracefully', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await service.revokeSession('non-existent-token');

      expect(sessionRepository.delete).toHaveBeenCalledWith({ token: 'non-existent-token' });
    });
  });

  describe('revokeAllUserSessions', () => {
    it('should delete all sessions for a user', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 3, raw: {} });

      await service.revokeAllUserSessions(1);

      expect(sessionRepository.delete).toHaveBeenCalledWith({ userId: 1 });
    });

    it('should handle user with no sessions gracefully', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await service.revokeAllUserSessions(999);

      expect(sessionRepository.delete).toHaveBeenCalledWith({ userId: 999 });
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should delete expired sessions', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 5, raw: {} });

      await service.cleanupExpiredSessions();

      expect(sessionRepository.delete).toHaveBeenCalledWith({
        expiresAt: expect.objectContaining({
          _type: 'lessThan',
        }),
      });
    });

    it('should handle no expired sessions gracefully', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await service.cleanupExpiredSessions();

      expect(sessionRepository.delete).toHaveBeenCalled();
    });
  });

  describe('getUserSessions', () => {
    it('should return active sessions for a user', async () => {
      const userSessions = [mockSession];
      sessionRepository.find.mockResolvedValue(userSessions);

      const result = await service.getUserSessions(1);

      expect(result).toBe(userSessions);
      expect(sessionRepository.find).toHaveBeenCalledWith({
        where: {
          userId: 1,
          expiresAt: expect.objectContaining({
            _type: 'moreThan',
          }),
        },
        order: { lastAccessedAt: 'DESC' },
      });
    });
  });

  describe('getSessionStats', () => {
    it('should return session statistics', async () => {
      sessionRepository.count
        .mockResolvedValueOnce(10) // total active sessions
        .mockResolvedValueOnce(3); // expired sessions

      const stats = await service.getSessionStats();

      expect(stats).toEqual({
        totalActiveSessions: 10,
        expiredSessions: 3,
      });
      expect(sessionRepository.count).toHaveBeenCalledTimes(2);
    });
  });

  describe('token generation', () => {
    it('should generate tokens with sufficient entropy', async () => {
      const createdSession = { ...mockSession };
      sessionRepository.create.mockReturnValue(createdSession);
      sessionRepository.save.mockResolvedValue(createdSession);

      const tokens = new Set();
      const numTokens = 100;

      // Generate multiple tokens to test uniqueness
      for (let i = 0; i < numTokens; i++) {
        const token = await service.createSession(mockUser);
        tokens.add(token);
      }

      // All tokens should be unique
      expect(tokens.size).toBe(numTokens);

      // Tokens should be base64url encoded (no padding, URL-safe characters)
      tokens.forEach((token) => {
        expect(token as string).toMatch(/^[A-Za-z0-9_-]+$/);
        expect((token as string).length).toBeGreaterThan(40); // 32 bytes base64url encoded should be ~43 chars
      });
    });
  });
});

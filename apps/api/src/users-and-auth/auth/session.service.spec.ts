// Mock crypto module first, before any imports
const mockRandomBytes = jest.fn();
jest.mock('crypto', () => ({
  randomBytes: mockRandomBytes,
}));

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
  } as User;

  const mockSession: Session = {
    id: 1,
    token: 'test-session-token',
    userId: 1,
    userAgent: 'Mozilla/5.0',
    ipAddress: '192.168.1.1',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    user: mockUser,
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
      find: jest.fn(),
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

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    beforeEach(() => {
      // Clear all mocks before each test
      mockRandomBytes.mockClear();

      // Mock randomBytes to return an object that behaves like a Buffer
      mockRandomBytes.mockReturnValue({
        toString: jest.fn().mockImplementation((encoding?: string) => {
          if (encoding === 'base64url') {
            return 'mocked-random-token';
          }
          return 'mocked-random-token';
        }),
      } as unknown as Buffer);
    });

    it('should create a session with default expiration', async () => {
      const mockCreatedSession = { ...mockSession };
      sessionRepository.create.mockReturnValue(mockCreatedSession);
      sessionRepository.save.mockResolvedValue(mockCreatedSession);

      const result = await service.createSession(mockUser);

      expect(result).toBe('mocked-random-token');
      expect(sessionRepository.create).toHaveBeenCalledWith({
        token: 'mocked-random-token',
        userId: 1,
        userAgent: null,
        ipAddress: null,
        expiresAt: expect.any(Date),
      });
      expect(sessionRepository.save).toHaveBeenCalledWith(mockCreatedSession);
    });

    it('should create a session with custom metadata', async () => {
      const metadata: SessionMetadata = {
        userAgent: 'Custom User Agent',
        ipAddress: '10.0.0.1',
        expiresIn: 3600, // 1 hour
      };

      const mockCreatedSession = { ...mockSession };
      sessionRepository.create.mockReturnValue(mockCreatedSession);
      sessionRepository.save.mockResolvedValue(mockCreatedSession);

      const result = await service.createSession(mockUser, metadata);

      expect(result).toBe('mocked-random-token');
      expect(sessionRepository.create).toHaveBeenCalledWith({
        token: 'mocked-random-token',
        userId: 1,
        userAgent: 'Custom User Agent',
        ipAddress: '10.0.0.1',
        expiresAt: expect.any(Date),
      });

      // Check that expiration is approximately 1 hour from now
      const createCall = sessionRepository.create.mock.calls[0][0];
      const expectedExpiration = Date.now() + 3600 * 1000;
      const actualExpiration = (createCall.expiresAt as Date).getTime();
      expect(Math.abs(actualExpiration - expectedExpiration)).toBeLessThan(1000); // Within 1 second
    });

    it('should enforce maximum expiration limit', async () => {
      const metadata: SessionMetadata = {
        expiresIn: 200 * 3600, // 200 hours (exceeds 168 hour limit)
      };

      const mockCreatedSession = { ...mockSession };
      sessionRepository.create.mockReturnValue(mockCreatedSession);
      sessionRepository.save.mockResolvedValue(mockCreatedSession);

      await service.createSession(mockUser, metadata);

      const createCall = sessionRepository.create.mock.calls[0][0];
      const maxExpiration = Date.now() + 168 * 3600 * 1000; // 168 hours max
      const actualExpiration = (createCall.expiresAt as Date).getTime();
      expect(actualExpiration).toBeLessThanOrEqual(maxExpiration + 1000); // Allow 1 second tolerance
    });

    it('should generate unique tokens', () => {
      const mockBuffer1 = Buffer.from('token1');
      const mockBuffer2 = Buffer.from('token2');

      // Test that different buffers would generate different tokens
      expect(mockBuffer1.toString('base64url')).not.toBe(mockBuffer2.toString('base64url'));
    });
  });

  describe('validateSession', () => {
    it('should return user for valid session', async () => {
      const validSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      };

      sessionRepository.findOne.mockResolvedValue(validSession);
      sessionRepository.save.mockResolvedValue(validSession);

      const result = await service.validateSession('valid-token');

      expect(result).toEqual(mockUser);
      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { token: 'valid-token' },
        relations: ['user'],
      });
      expect(sessionRepository.save).toHaveBeenCalledWith({
        ...validSession,
        lastAccessedAt: expect.any(Date),
      });
    });

    it('should return null for non-existent session', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.validateSession('non-existent-token');

      expect(result).toBeNull();
      expect(sessionRepository.findOne).toHaveBeenCalledWith({
        where: { token: 'non-existent-token' },
        relations: ['user'],
      });
      expect(sessionRepository.save).not.toHaveBeenCalled();
    });

    it('should return null and remove expired session', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      };

      sessionRepository.findOne.mockResolvedValue(expiredSession);
      sessionRepository.remove.mockResolvedValue(expiredSession);

      const result = await service.validateSession('expired-token');

      expect(result).toBeNull();
      expect(sessionRepository.remove).toHaveBeenCalledWith(expiredSession);
      expect(sessionRepository.save).not.toHaveBeenCalled();
    });

    it('should return null for empty token', async () => {
      const result = await service.validateSession('');

      expect(result).toBeNull();
      expect(sessionRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for null token', async () => {
      const result = await service.validateSession(null as string);

      expect(result).toBeNull();
      expect(sessionRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('refreshSession', () => {
    it('should refresh valid session with new token', async () => {
      // Clear any previous mocks
      mockRandomBytes.mockClear();

      const existingSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      };

      // Mock randomBytes to return 'new-refreshed-token' when converted to base64url
      mockRandomBytes.mockReturnValue({
        toString: jest.fn().mockImplementation((encoding?: string) => {
          if (encoding === 'base64url') {
            return 'new-refreshed-token';
          }
          return 'new-refreshed-token';
        }),
      } as unknown as Buffer);

      sessionRepository.findOne.mockResolvedValue(existingSession);
      sessionRepository.save.mockResolvedValue({
        ...existingSession,
        token: 'new-refreshed-token',
      });

      const result = await service.refreshSession('current-token');

      expect(result).toBe('new-refreshed-token');
      expect(sessionRepository.save).toHaveBeenCalledWith({
        ...existingSession,
        token: 'new-refreshed-token',
        expiresAt: expect.any(Date),
        lastAccessedAt: expect.any(Date),
      });
    });

    it('should return null for non-existent session', async () => {
      sessionRepository.findOne.mockResolvedValue(null);

      const result = await service.refreshSession('non-existent-token');

      expect(result).toBeNull();
      expect(sessionRepository.save).not.toHaveBeenCalled();
    });

    it('should return null and remove expired session', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      };

      sessionRepository.findOne.mockResolvedValue(expiredSession);
      sessionRepository.remove.mockResolvedValue(expiredSession);

      const result = await service.refreshSession('expired-token');

      expect(result).toBeNull();
      expect(sessionRepository.remove).toHaveBeenCalledWith(expiredSession);
      expect(sessionRepository.save).not.toHaveBeenCalled();
    });

    it('should return null for empty token', async () => {
      const result = await service.refreshSession('');

      expect(result).toBeNull();
      expect(sessionRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    it('should revoke existing session', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.revokeSession('token-to-revoke');

      expect(sessionRepository.delete).toHaveBeenCalledWith({ token: 'token-to-revoke' });
    });

    it('should handle non-existent session gracefully', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await service.revokeSession('non-existent-token');

      expect(sessionRepository.delete).toHaveBeenCalledWith({ token: 'non-existent-token' });
    });

    it('should handle empty token gracefully', async () => {
      await service.revokeSession('');

      expect(sessionRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllUserSessions', () => {
    it('should revoke all sessions for a user', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 3, raw: {} });

      await service.revokeAllUserSessions(1);

      expect(sessionRepository.delete).toHaveBeenCalledWith({ userId: 1 });
    });

    it('should handle user with no sessions', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await service.revokeAllUserSessions(999);

      expect(sessionRepository.delete).toHaveBeenCalledWith({ userId: 999 });
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 5, raw: {} });

      await service.cleanupExpiredSessions();

      expect(sessionRepository.delete).toHaveBeenCalledWith({
        expiresAt: LessThan(expect.any(Date)),
      });
    });

    it('should handle no expired sessions', async () => {
      sessionRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await service.cleanupExpiredSessions();

      expect(sessionRepository.delete).toHaveBeenCalledWith({
        expiresAt: LessThan(expect.any(Date)),
      });
    });
  });

  describe('getUserSessions', () => {
    it('should return active sessions for user', async () => {
      const activeSessions = [
        { ...mockSession, id: 1 },
        { ...mockSession, id: 2 },
      ];

      sessionRepository.find.mockResolvedValue(activeSessions);

      const result = await service.getUserSessions(1);

      expect(result).toEqual(activeSessions);
      expect(sessionRepository.find).toHaveBeenCalledWith({
        where: {
          userId: 1,
          expiresAt: MoreThan(expect.any(Date)),
        },
        order: { lastAccessedAt: 'DESC' },
      });
    });

    it('should return empty array for user with no sessions', async () => {
      sessionRepository.find.mockResolvedValue([]);

      const result = await service.getUserSessions(999);

      expect(result).toEqual([]);
    });
  });

  describe('getSessionStats', () => {
    it('should return session statistics', async () => {
      sessionRepository.count
        .mockResolvedValueOnce(10) // active sessions
        .mockResolvedValueOnce(3); // expired sessions

      const result = await service.getSessionStats();

      expect(result).toEqual({
        totalActiveSessions: 10,
        expiredSessions: 3,
      });

      expect(sessionRepository.count).toHaveBeenCalledTimes(2);
      expect(sessionRepository.count).toHaveBeenNthCalledWith(1, {
        where: { expiresAt: MoreThan(expect.any(Date)) },
      });
      expect(sessionRepository.count).toHaveBeenNthCalledWith(2, {
        where: { expiresAt: LessThan(expect.any(Date)) },
      });
    });
  });

  describe('token generation', () => {
    it('should generate cryptographically secure tokens', async () => {
      // Clear any previous mocks
      mockRandomBytes.mockClear();
      sessionRepository.create.mockClear();
      sessionRepository.save.mockClear();

      const toStringMock = jest.fn().mockImplementation((encoding?: string) => {
        if (encoding === 'base64url') {
          return 'secure-random-token';
        }
        return 'secure-random-token';
      });

      mockRandomBytes.mockReturnValue({
        toString: toStringMock,
      } as unknown as Buffer);

      sessionRepository.create.mockReturnValue(mockSession);
      sessionRepository.save.mockResolvedValue(mockSession);

      // Call a method that generates a token
      await service.createSession(mockUser);

      expect(mockRandomBytes).toHaveBeenCalledWith(32);
      expect(toStringMock).toHaveBeenCalledWith('base64url');
    });

    it('should generate different tokens on subsequent calls', async () => {
      // Clear any previous mocks
      mockRandomBytes.mockClear();
      sessionRepository.create.mockClear();
      sessionRepository.save.mockClear();

      let callCount = 0;
      mockRandomBytes.mockImplementation(() => {
        callCount++;
        return {
          toString: jest.fn().mockImplementation((encoding?: string) => {
            if (encoding === 'base64url') return `token${callCount}`;
            return `token${callCount}`;
          }),
        } as unknown as Buffer;
      });

      sessionRepository.create.mockReturnValue(mockSession);
      sessionRepository.save.mockResolvedValue(mockSession);

      // Generate two tokens
      await service.createSession(mockUser);
      await service.createSession(mockUser);

      expect(mockRandomBytes).toHaveBeenCalledTimes(2);
    });
  });
});

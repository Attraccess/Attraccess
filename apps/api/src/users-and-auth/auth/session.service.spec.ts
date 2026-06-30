// Mock crypto module first, before any imports
const mockRandomBytes = jest.fn();
jest.mock('crypto', () => ({
  randomBytes: mockRandomBytes,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { SessionService, SessionMetadata } from './session.service';
import { User } from '@attraccess/database-entities';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { SESSION_STORE, SessionStore } from './session-store/session-store';

describe('SessionService', () => {
  let service: SessionService;
  let store: jest.Mocked<SessionStore>;
  let metrics: { authActiveSessions: { inc: jest.Mock; dec: jest.Mock; set: jest.Mock } };

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
  } as User;

  function makeStore(): jest.Mocked<SessionStore> {
    return {
      createSession: jest.fn().mockResolvedValue(undefined),
      validateSession: jest.fn().mockResolvedValue(null),
      rotateSession: jest.fn().mockResolvedValue(false),
      revokeSession: jest.fn().mockResolvedValue(false),
      revokeAllUserSessions: jest.fn().mockResolvedValue(0),
      cleanupExpired: jest.fn().mockResolvedValue(null),
      getUserSessions: jest.fn().mockResolvedValue([]),
      getStats: jest.fn().mockResolvedValue({ totalActiveSessions: 0, expiredSessions: 0 }),
      countActive: jest.fn().mockResolvedValue(0),
    };
  }

  beforeEach(async () => {
    mockRandomBytes.mockReturnValue({
      toString: jest.fn().mockImplementation((enc?: string) =>
        enc === 'base64url' ? 'mocked-random-token' : 'mocked-random-token'
      ),
    } as unknown as Buffer);

    store = makeStore();
    metrics = { authActiveSessions: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: SESSION_STORE, useValue: store },
        { provide: TokenHashService, useValue: { hashToken: jest.fn((t: string) => `hashed:${t}`) } },
        { provide: MetricsService, useValue: metrics },
        { provide: CronTimer, useValue: { time: <T,>(_n: string, fn: () => Promise<T>) => fn() } },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    jest.clearAllMocks();

    // Re-apply default mock return values after clearAllMocks
    store.createSession.mockResolvedValue(undefined);
    store.validateSession.mockResolvedValue(null);
    store.rotateSession.mockResolvedValue(false);
    store.revokeSession.mockResolvedValue(false);
    store.revokeAllUserSessions.mockResolvedValue(0);
    store.cleanupExpired.mockResolvedValue(null);
    store.getUserSessions.mockResolvedValue([]);
    store.getStats.mockResolvedValue({ totalActiveSessions: 0, expiredSessions: 0 });
    store.countActive.mockResolvedValue(0);

    mockRandomBytes.mockReturnValue({
      toString: jest.fn().mockImplementation((enc?: string) =>
        enc === 'base64url' ? 'mocked-random-token' : 'mocked-random-token'
      ),
    } as unknown as Buffer);
  });

  describe('onModuleInit', () => {
    it('should set active sessions metric from store', async () => {
      store.countActive.mockResolvedValue(7);
      await service.onModuleInit();
      expect(metrics.authActiveSessions.set).toHaveBeenCalledWith(7);
    });
  });

  describe('createSession', () => {
    it('should return raw token and delegate to store', async () => {
      const result = await service.createSession(mockUser);
      expect(result).toBe('mocked-random-token');
      expect(store.createSession).toHaveBeenCalledWith(
        'hashed:mocked-random-token',
        1,
        undefined,
        expect.any(Date),
      );
      expect(metrics.authActiveSessions.inc).toHaveBeenCalled();
    });

    it('should pass metadata to store', async () => {
      const metadata: SessionMetadata = { userAgent: 'UA', ipAddress: '1.2.3.4', expiresIn: 3600 };
      await service.createSession(mockUser, metadata);
      expect(store.createSession).toHaveBeenCalledWith(
        'hashed:mocked-random-token',
        1,
        metadata,
        expect.any(Date),
      );
    });

    it('should clamp expiration to 168 hours max', async () => {
      const metadata: SessionMetadata = { expiresIn: 200 * 3600 };
      await service.createSession(mockUser, metadata);
      const [, , , expiresAt] = store.createSession.mock.calls[0];
      const maxExpiry = Date.now() + 168 * 3600 * 1000;
      expect((expiresAt as Date).getTime()).toBeLessThanOrEqual(maxExpiry + 1000);
    });
  });

  describe('validateSession', () => {
    it('should delegate to store and return user', async () => {
      store.validateSession.mockResolvedValue(mockUser);
      const result = await service.validateSession('some-token');
      expect(result).toBe(mockUser);
      expect(store.validateSession).toHaveBeenCalledWith('some-token');
    });

    it('should return null for empty token without calling store', async () => {
      expect(await service.validateSession('')).toBeNull();
      expect(store.validateSession).not.toHaveBeenCalled();
    });

    it('should return null for null token without calling store', async () => {
      expect(await service.validateSession(null as string)).toBeNull();
      expect(store.validateSession).not.toHaveBeenCalled();
    });
  });

  describe('refreshSession', () => {
    it('should return new token when store rotates successfully', async () => {
      store.rotateSession.mockResolvedValue(true);
      const result = await service.refreshSession('old-token');
      expect(result).toBe('mocked-random-token');
      expect(store.rotateSession).toHaveBeenCalledWith(
        'old-token',
        'hashed:mocked-random-token',
        expect.any(Date),
      );
    });

    it('should return null when store signals session not found', async () => {
      store.rotateSession.mockResolvedValue(false);
      expect(await service.refreshSession('bad-token')).toBeNull();
    });

    it('should return null for empty token without calling store', async () => {
      expect(await service.refreshSession('')).toBeNull();
      expect(store.rotateSession).not.toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    it('should decrement metric when session was active', async () => {
      store.revokeSession.mockResolvedValue(true);
      await service.revokeSession('active-token');
      expect(store.revokeSession).toHaveBeenCalledWith('active-token');
      expect(metrics.authActiveSessions.dec).toHaveBeenCalled();
    });

    it('should not decrement metric when session was already inactive', async () => {
      store.revokeSession.mockResolvedValue(false);
      await service.revokeSession('expired-token');
      expect(metrics.authActiveSessions.dec).not.toHaveBeenCalled();
    });

    it('should handle empty token without calling store', async () => {
      await service.revokeSession('');
      expect(store.revokeSession).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllUserSessions', () => {
    it('should decrement metric by active count', async () => {
      store.revokeAllUserSessions.mockResolvedValue(3);
      await service.revokeAllUserSessions(1);
      expect(store.revokeAllUserSessions).toHaveBeenCalledWith(1);
      expect(metrics.authActiveSessions.dec).toHaveBeenCalledWith(3);
    });

    it('should not decrement when no active sessions', async () => {
      store.revokeAllUserSessions.mockResolvedValue(0);
      await service.revokeAllUserSessions(999);
      expect(metrics.authActiveSessions.dec).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should update metric when store returns count (SQLite path)', async () => {
      store.cleanupExpired.mockResolvedValue({ remainingActive: 5 });
      await service.cleanupExpiredSessions();
      expect(metrics.authActiveSessions.set).toHaveBeenCalledWith(5);
    });

    it('should not update metric when store returns null (Valkey TTL path)', async () => {
      store.cleanupExpired.mockResolvedValue(null);
      await service.cleanupExpiredSessions();
      expect(metrics.authActiveSessions.set).not.toHaveBeenCalled();
    });
  });

  describe('getUserSessions', () => {
    it('should delegate to store', async () => {
      const sessions = [{ id: 1 }, { id: 2 }] as unknown as import('@attraccess/database-entities').Session[];
      store.getUserSessions.mockResolvedValue(sessions);
      const result = await service.getUserSessions(1);
      expect(result).toBe(sessions);
      expect(store.getUserSessions).toHaveBeenCalledWith(1);
    });
  });

  describe('getSessionStats', () => {
    it('should delegate to store', async () => {
      const stats = { totalActiveSessions: 10, expiredSessions: 3 };
      store.getStats.mockResolvedValue(stats);
      const result = await service.getSessionStats();
      expect(result).toBe(stats);
    });
  });

  describe('token generation', () => {
    it('should call randomBytes(32) with base64url encoding', async () => {
      const toStringMock = jest.fn().mockReturnValue('secure-token');
      mockRandomBytes.mockReturnValue({ toString: toStringMock } as unknown as Buffer);
      await service.createSession(mockUser);
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
      expect(toStringMock).toHaveBeenCalledWith('base64url');
    });
  });
});

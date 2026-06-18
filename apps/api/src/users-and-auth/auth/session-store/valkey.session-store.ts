import { Repository } from 'typeorm';
import { Session, User } from '@attraccess/database-entities';
import type { Redis } from 'ioredis';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { SessionStore, SessionMetadata } from './session-store';

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';
const MAX_EXPIRATION_HOURS = 168;

export class ValkeySessionStore implements SessionStore {
  constructor(
    private readonly client: Redis,
    private readonly userRepository: Repository<User>,
    private readonly tokenHashService: TokenHashService,
  ) {}

  async createSession(hashedToken: string, userId: number, metadata: SessionMetadata | undefined, expiresAt: Date): Promise<void> {
    const key = `${SESSION_PREFIX}${hashedToken}`;
    const ttl = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    const pipeline = this.client.pipeline();
    pipeline.hset(key, {
      userId: String(userId),
      userAgent: metadata?.userAgent || '',
      ipAddress: metadata?.ipAddress || '',
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    });
    pipeline.expire(key, ttl);
    pipeline.sadd(`${USER_SESSIONS_PREFIX}${userId}`, hashedToken);
    pipeline.expire(`${USER_SESSIONS_PREFIX}${userId}`, MAX_EXPIRATION_HOURS * 3600);
    await pipeline.exec();
  }

  async validateSession(token: string): Promise<User | null> {
    const hashedToken = this.tokenHashService.hashToken(token);
    const key = `${SESSION_PREFIX}${hashedToken}`;
    const data = await this.client.hgetall(key);
    if (!data?.['userId']) return null;

    const expiresAt = new Date(data['expiresAt'] ?? 0);
    if (expiresAt < new Date()) {
      await this.client.del(key);
      return null;
    }

    const remaining = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    await this.client.expire(key, remaining);
    return this.userRepository.findOne({ where: { id: parseInt(data['userId'], 10) } });
  }

  async rotateSession(token: string, newHashedToken: string, newExpiresAt: Date): Promise<boolean> {
    const hashedToken = this.tokenHashService.hashToken(token);
    const key = `${SESSION_PREFIX}${hashedToken}`;
    const data = await this.client.hgetall(key);
    if (!data?.['userId']) return false;

    const expiresAt = new Date(data['expiresAt'] ?? 0);
    if (expiresAt < new Date()) {
      await this.client.del(key);
      return false;
    }

    const userId = parseInt(data['userId'], 10);
    const newKey = `${SESSION_PREFIX}${newHashedToken}`;
    const newTtl = Math.max(1, Math.floor((newExpiresAt.getTime() - Date.now()) / 1000));
    const pipeline = this.client.pipeline();
    pipeline.del(key);
    pipeline.srem(`${USER_SESSIONS_PREFIX}${userId}`, hashedToken);
    pipeline.hset(newKey, { ...data, expiresAt: newExpiresAt.toISOString() });
    pipeline.expire(newKey, newTtl);
    pipeline.sadd(`${USER_SESSIONS_PREFIX}${userId}`, newHashedToken);
    await pipeline.exec();
    return true;
  }

  async revokeSession(token: string): Promise<boolean> {
    const hashedToken = this.tokenHashService.hashToken(token);
    const key = `${SESSION_PREFIX}${hashedToken}`;
    const data = await this.client.hgetall(key);
    if (!data?.['userId']) return false;

    const wasActive = new Date(data['expiresAt'] ?? 0) > new Date();
    const userId = parseInt(data['userId'], 10);
    const pipeline = this.client.pipeline();
    pipeline.del(key);
    pipeline.srem(`${USER_SESSIONS_PREFIX}${userId}`, hashedToken);
    await pipeline.exec();
    return wasActive;
  }

  async revokeAllUserSessions(userId: number): Promise<number> {
    const userKey = `${USER_SESSIONS_PREFIX}${userId}`;
    const hashedTokens = await this.client.smembers(userKey);
    if (!hashedTokens.length) return 0;

    const now = new Date();
    let activeCount = 0;
    const pipeline = this.client.pipeline();
    for (const ht of hashedTokens) {
      const expiresAtStr = await this.client.hget(`${SESSION_PREFIX}${ht}`, 'expiresAt');
      if (expiresAtStr && new Date(expiresAtStr) > now) activeCount++;
      pipeline.del(`${SESSION_PREFIX}${ht}`);
    }
    pipeline.del(userKey);
    await pipeline.exec();
    return activeCount;
  }

  async cleanupExpired(): Promise<null> {
    return null; // TTL handles expiry natively
  }

  async getUserSessions(userId: number): Promise<Session[]> {
    const hashedTokens = await this.client.smembers(`${USER_SESSIONS_PREFIX}${userId}`);
    const now = new Date();
    const sessions: Session[] = [];
    for (const ht of hashedTokens) {
      const data = await this.client.hgetall(`${SESSION_PREFIX}${ht}`);
      if (!data?.['userId']) continue;
      const expiresAt = new Date(data['expiresAt'] ?? 0);
      if (expiresAt < now) continue;
      sessions.push({
        id: 0,
        token: ht,
        userId: parseInt(data['userId'], 10),
        userAgent: data['userAgent'] || null,
        ipAddress: data['ipAddress'] || null,
        expiresAt,
        createdAt: new Date(data['createdAt'] ?? 0),
        lastAccessedAt: expiresAt,
        user: null as unknown as User,
      });
    }
    return sessions.sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());
  }

  async getStats(): Promise<{ totalActiveSessions: number; expiredSessions: number }> {
    return { totalActiveSessions: await this.countActive(), expiredSessions: 0 };
  }

  async countActive(): Promise<number> {
    let count = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${SESSION_PREFIX}*`, 'COUNT', 100);
      count += keys.length;
      cursor = next;
    } while (cursor !== '0');
    return count;
  }
}

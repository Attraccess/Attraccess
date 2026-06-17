import { Injectable, Logger, Optional, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Session, User } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import type { Redis } from 'ioredis';
import { VALKEY_CLIENT } from '../../valkey/valkey.module';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
  expiresIn?: number; // seconds
}

const SESSION_KEY_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';
const DEFAULT_EXPIRATION_HOURS = 24;
const MAX_EXPIRATION_HOURS = 168; // 7 days

@Injectable()
export class SessionService implements OnModuleInit {
  private readonly logger = new Logger(SessionService.name);
  private readonly defaultExpirationHours = DEFAULT_EXPIRATION_HOURS;
  private readonly maxExpirationHours = MAX_EXPIRATION_HOURS;

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly tokenHashService: TokenHashService,
    private readonly metricsService: MetricsService,
    private readonly cronTimer: CronTimer,
    @Optional() @Inject(VALKEY_CLIENT) private readonly valkeyClient: Redis | null,
  ) {
    if (valkeyClient) {
      this.logger.log('Session store: Valkey (Redis-compatible)');
    } else {
      this.logger.log('Session store: SQLite (default)');
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.valkeyClient) {
      return;
    }
    // MetricsService already set authActiveSessions from SQLite (= 0 when Valkey active).
    // Override with the actual count from Valkey now that the client is ready.
    const count = await this.countValkeySessions();
    this.metricsService.authActiveSessions.set(count);
    this.logger.log(`Restored active session count from Valkey: ${count}`);
  }

  async createSession(user: User, metadata?: SessionMetadata): Promise<string> {
    const token = this.generateSessionToken();
    const hashedToken = this.tokenHashService.hashToken(token);
    const expiresIn = metadata?.expiresIn || this.defaultExpirationHours * 3600;
    const actualExpiresIn = Math.min(expiresIn, this.maxExpirationHours * 3600);
    const expiresAt = new Date(Date.now() + actualExpiresIn * 1000);

    if (this.valkeyClient) {
      await this.createValkeySession(hashedToken, user, metadata, expiresAt, actualExpiresIn);
    } else {
      await this.createSqliteSession(hashedToken, user, metadata, expiresAt);
    }

    this.metricsService.authActiveSessions.inc();
    this.logger.log(`Created session for user ${user.id} (${user.username}), expires at ${expiresAt.toISOString()}`);

    return token;
  }

  async validateSession(token: string): Promise<User | null> {
    if (!token) {
      return null;
    }

    if (this.valkeyClient) {
      return this.validateValkeySession(token);
    }
    return this.validateSqliteSession(token);
  }

  async refreshSession(token: string): Promise<string | null> {
    if (!token) {
      return null;
    }

    if (this.valkeyClient) {
      return this.refreshValkeySession(token);
    }
    return this.refreshSqliteSession(token);
  }

  async revokeSession(token: string): Promise<void> {
    if (!token) {
      return;
    }

    if (this.valkeyClient) {
      await this.revokeValkeySession(token);
    } else {
      await this.revokeSqliteSession(token);
    }
  }

  async revokeAllUserSessions(userId: number): Promise<void> {
    if (this.valkeyClient) {
      await this.revokeAllValkeyUserSessions(userId);
    } else {
      await this.revokeAllSqliteUserSessions(userId);
    }
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupExpiredSessions(): Promise<void> {
    // Valkey uses native TTL — no manual cleanup needed
    if (this.valkeyClient) {
      return;
    }

    await this.cronTimer.time('session_cleanup', async () => {
      const now = new Date();
      const result = await this.sessionRepository.delete({
        expiresAt: LessThan(now),
      });

      if (result.affected && result.affected > 0) {
        this.logger.log(`Cleaned up ${result.affected} expired sessions`);
        const activeCount = await this.sessionRepository.count({ where: { expiresAt: MoreThan(new Date()) } });
        this.metricsService.authActiveSessions.set(activeCount);
      }
    });
  }

  async getUserSessions(userId: number): Promise<Session[]> {
    if (this.valkeyClient) {
      return this.getValkeyUserSessions(userId);
    }
    return this.sessionRepository.find({
      where: {
        userId,
        expiresAt: MoreThan(new Date()),
      },
      order: { lastAccessedAt: 'DESC' },
    });
  }

  async getSessionStats(): Promise<{ totalActiveSessions: number; expiredSessions: number }> {
    if (this.valkeyClient) {
      return this.getValkeySessionStats();
    }
    const now = new Date();
    const [totalActiveSessions, expiredSessions] = await Promise.all([
      this.sessionRepository.count({ where: { expiresAt: MoreThan(now) } }),
      this.sessionRepository.count({ where: { expiresAt: LessThan(now) } }),
    ]);
    return { totalActiveSessions, expiredSessions };
  }

  // --- Valkey implementation ---

  private get client(): Redis {
    if (!this.valkeyClient) {
      throw new Error('Valkey client not available');
    }
    return this.valkeyClient;
  }

  private sessionKey(hashedToken: string): string {
    return `${SESSION_KEY_PREFIX}${hashedToken}`;
  }

  private userSessionsKey(userId: number): string {
    return `${USER_SESSIONS_PREFIX}${userId}`;
  }

  private async createValkeySession(
    hashedToken: string,
    user: User,
    metadata: SessionMetadata | undefined,
    expiresAt: Date,
    ttlSeconds: number,
  ): Promise<void> {
    const key = this.sessionKey(hashedToken);
    const pipeline = this.client.pipeline();
    pipeline.hset(key, {
      userId: String(user.id),
      userAgent: metadata?.userAgent || '',
      ipAddress: metadata?.ipAddress || '',
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    });
    pipeline.expire(key, ttlSeconds);
    pipeline.sadd(this.userSessionsKey(user.id), hashedToken);
    // User index TTL is max session lifetime; individual sessions clean themselves up
    pipeline.expire(this.userSessionsKey(user.id), this.maxExpirationHours * 3600);
    await pipeline.exec();
  }

  private async validateValkeySession(token: string): Promise<User | null> {
    const hashedToken = this.tokenHashService.hashToken(token);
    const key = this.sessionKey(hashedToken);
    const data = await this.client.hgetall(key);

    if (!data || !data['userId']) {
      return null;
    }

    const expiresAt = new Date(data['expiresAt'] ?? 0);
    if (expiresAt < new Date()) {
      await this.client.del(key);
      return null;
    }

    // Refresh TTL on access
    const remainingSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    if (remainingSeconds > 0) {
      await this.client.expire(key, remainingSeconds);
    }

    return this.loadUserById(parseInt(data['userId'] ?? '0', 10));
  }

  private async refreshValkeySession(token: string): Promise<string | null> {
    const hashedToken = this.tokenHashService.hashToken(token);
    const key = this.sessionKey(hashedToken);
    const data = await this.client.hgetall(key);

    if (!data || !data['userId']) {
      return null;
    }

    const expiresAt = new Date(data['expiresAt'] ?? 0);
    if (expiresAt < new Date()) {
      await this.client.del(key);
      return null;
    }

    const userId = parseInt(data['userId'] ?? '0', 10);
    const newToken = this.generateSessionToken();
    const newHashedToken = this.tokenHashService.hashToken(newToken);
    const newExpiresAt = new Date(Date.now() + this.defaultExpirationHours * 3600 * 1000);
    const newTtl = this.defaultExpirationHours * 3600;

    const pipeline = this.client.pipeline();
    // Remove old key and user index entry
    pipeline.del(key);
    pipeline.srem(this.userSessionsKey(userId), hashedToken);
    // Create new key
    pipeline.hset(this.sessionKey(newHashedToken), {
      ...data,
      expiresAt: newExpiresAt.toISOString(),
    });
    pipeline.expire(this.sessionKey(newHashedToken), newTtl);
    pipeline.sadd(this.userSessionsKey(userId), newHashedToken);
    await pipeline.exec();

    const user = await this.loadUserById(userId);
    if (user) {
      this.logger.log(`Refreshed session for user ${userId} (${user.username})`);
    }
    return newToken;
  }

  private async revokeValkeySession(token: string): Promise<void> {
    const hashedToken = this.tokenHashService.hashToken(token);
    const key = this.sessionKey(hashedToken);
    const data = await this.client.hgetall(key);

    if (!data || !data['userId']) {
      return;
    }

    const userId = parseInt(data['userId'] ?? '0', 10);
    const expiresAt = new Date(data['expiresAt'] ?? 0);
    const wasActive = expiresAt > new Date();

    const pipeline = this.client.pipeline();
    pipeline.del(key);
    pipeline.srem(this.userSessionsKey(userId), hashedToken);
    await pipeline.exec();

    if (wasActive) {
      this.metricsService.authActiveSessions.dec();
    }
    this.logger.log(`Revoked session with token: ${token.substring(0, 8)}...`);
  }

  private async revokeAllValkeyUserSessions(userId: number): Promise<void> {
    const userKey = this.userSessionsKey(userId);
    const hashedTokens = await this.client.smembers(userKey);

    if (!hashedTokens.length) {
      return;
    }

    const now = new Date();
    let activeCount = 0;
    const pipeline = this.client.pipeline();

    for (const hashedToken of hashedTokens) {
      const key = this.sessionKey(hashedToken);
      const expiresAtStr = await this.client.hget(key, 'expiresAt');
      if (expiresAtStr && new Date(expiresAtStr) > now) {
        activeCount++;
      }
      pipeline.del(key);
    }
    pipeline.del(userKey);
    await pipeline.exec();

    this.logger.log(`Revoked ${hashedTokens.length} sessions for user ${userId}`);
    if (activeCount > 0) {
      this.metricsService.authActiveSessions.dec(activeCount);
    }
  }

  private async getValkeyUserSessions(userId: number): Promise<Session[]> {
    const userKey = this.userSessionsKey(userId);
    const hashedTokens = await this.client.smembers(userKey);
    const now = new Date();
    const sessions: Session[] = [];

    for (const hashedToken of hashedTokens) {
      const data = await this.client.hgetall(this.sessionKey(hashedToken));
      if (!data || !data['userId']) {
        continue;
      }
      const expiresAt = new Date(data['expiresAt'] ?? 0);
      if (expiresAt < now) {
        continue;
      }
      sessions.push({
        id: 0,
        token: hashedToken,
        userId: parseInt(data['userId'] ?? '0', 10),
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

  private async getValkeySessionStats(): Promise<{ totalActiveSessions: number; expiredSessions: number }> {
    // With TTL-based expiry, expired sessions are auto-deleted by Valkey; no expired count available
    return { totalActiveSessions: await this.countValkeySessions(), expiredSessions: 0 };
  }

  private async countValkeySessions(): Promise<number> {
    let count = 0;
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${SESSION_KEY_PREFIX}*`, 'COUNT', 100);
      count += keys.length;
      cursor = next;
    } while (cursor !== '0');
    return count;
  }

  // --- SQLite implementation (unchanged) ---

  private async createSqliteSession(
    hashedToken: string,
    user: User,
    metadata: SessionMetadata | undefined,
    expiresAt: Date,
  ): Promise<void> {
    const session = this.sessionRepository.create({
      token: hashedToken,
      userId: user.id,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
      expiresAt,
    });
    await this.sessionRepository.save(session);
  }

  private async validateSqliteSession(token: string): Promise<User | null> {
    const session = await this.findSqliteSessionByToken(token, true);
    if (!session) {
      return null;
    }
    if (session.expiresAt < new Date()) {
      await this.sessionRepository.remove(session);
      this.logger.debug(`Removed expired session for user ${session.userId}`);
      return null;
    }
    session.lastAccessedAt = new Date();
    await this.sessionRepository.save(session);
    return session.user;
  }

  private async refreshSqliteSession(token: string): Promise<string | null> {
    const session = await this.findSqliteSessionByToken(token, true);
    if (!session) {
      return null;
    }
    if (session.expiresAt < new Date()) {
      await this.sessionRepository.remove(session);
      this.logger.debug(`Removed expired session during refresh for user ${session.userId}`);
      return null;
    }

    const newToken = this.generateSessionToken();
    const storedToken = this.tokenHashService.hashToken(newToken);
    session.token = storedToken;
    session.expiresAt = new Date(Date.now() + this.defaultExpirationHours * 3600 * 1000);
    session.lastAccessedAt = new Date();
    await this.sessionRepository.save(session);

    this.logger.log(`Refreshed session for user ${session.userId} (${session.user.username})`);
    return newToken;
  }

  private async revokeSqliteSession(token: string): Promise<void> {
    const hashed = this.tokenHashService.hashToken(token);
    const now = new Date();
    const existing = await this.sessionRepository.findOne({
      where: [{ token: hashed }, { token }],
      select: ['id', 'expiresAt'],
    });
    if (!existing) {
      return;
    }
    const wasActive = existing.expiresAt > now;
    await this.sessionRepository.delete({ id: existing.id });
    if (wasActive) {
      this.metricsService.authActiveSessions.dec();
    }
    this.logger.log(`Revoked session with token: ${token.substring(0, 8)}...`);
  }

  private async revokeAllSqliteUserSessions(userId: number): Promise<void> {
    const activeBefore = await this.sessionRepository.count({
      where: { userId, expiresAt: MoreThan(new Date()) },
    });
    const result = await this.sessionRepository.delete({ userId });

    if (result.affected && result.affected > 0) {
      this.logger.log(`Revoked ${result.affected} sessions for user ${userId}`);
      if (activeBefore > 0) {
        this.metricsService.authActiveSessions.dec(activeBefore);
      }
    }
  }

  private async findSqliteSessionByToken(token: string, withUser: boolean): Promise<Session | null> {
    const hashed = this.tokenHashService.hashToken(token);
    const relations = withUser ? ['user'] : undefined;
    let session = await this.sessionRepository.findOne({ where: { token: hashed }, relations });
    if (session) {
      return session;
    }
    session = await this.sessionRepository.findOne({ where: { token }, relations });
    if (!session) {
      return null;
    }
    session.token = hashed;
    await this.sessionRepository.save(session);
    return session;
  }

  private generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private async loadUserById(userId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }
}

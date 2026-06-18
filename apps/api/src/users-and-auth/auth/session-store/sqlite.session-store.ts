import { Repository, LessThan, MoreThan } from 'typeorm';
import { Session, User } from '@attraccess/database-entities';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { SessionStore, SessionMetadata } from './session-store';

export class SqliteSessionStore implements SessionStore {
  constructor(
    private readonly sessionRepository: Repository<Session>,
    private readonly tokenHashService: TokenHashService,
  ) {}

  async createSession(hashedToken: string, userId: number, metadata: SessionMetadata | undefined, expiresAt: Date): Promise<void> {
    const session = this.sessionRepository.create({
      token: hashedToken,
      userId,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
      expiresAt,
    });
    await this.sessionRepository.save(session);
  }

  async validateSession(token: string): Promise<User | null> {
    const session = await this.findByToken(token, true);
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await this.sessionRepository.remove(session);
      return null;
    }
    session.lastAccessedAt = new Date();
    await this.sessionRepository.save(session);
    return session.user;
  }

  async rotateSession(token: string, newHashedToken: string, newExpiresAt: Date): Promise<boolean> {
    const session = await this.findByToken(token, true);
    if (!session) return false;
    if (session.expiresAt < new Date()) {
      await this.sessionRepository.remove(session);
      return false;
    }
    session.token = newHashedToken;
    session.expiresAt = newExpiresAt;
    session.lastAccessedAt = new Date();
    await this.sessionRepository.save(session);
    return true;
  }

  async revokeSession(token: string): Promise<boolean> {
    const hashed = this.tokenHashService.hashToken(token);
    const existing = await this.sessionRepository.findOne({
      where: [{ token: hashed }, { token }],
      select: ['id', 'expiresAt'],
    });
    if (!existing) return false;
    const wasActive = existing.expiresAt > new Date();
    await this.sessionRepository.delete({ id: existing.id });
    return wasActive;
  }

  async revokeAllUserSessions(userId: number): Promise<number> {
    const activeCount = await this.sessionRepository.count({
      where: { userId, expiresAt: MoreThan(new Date()) },
    });
    await this.sessionRepository.delete({ userId });
    return activeCount;
  }

  async cleanupExpired(): Promise<{ remainingActive: number }> {
    await this.sessionRepository.delete({ expiresAt: LessThan(new Date()) });
    const remainingActive = await this.sessionRepository.count({
      where: { expiresAt: MoreThan(new Date()) },
    });
    return { remainingActive };
  }

  async getUserSessions(userId: number): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { userId, expiresAt: MoreThan(new Date()) },
      order: { lastAccessedAt: 'DESC' },
    });
  }

  async getStats(): Promise<{ totalActiveSessions: number; expiredSessions: number }> {
    const now = new Date();
    const [totalActiveSessions, expiredSessions] = await Promise.all([
      this.sessionRepository.count({ where: { expiresAt: MoreThan(now) } }),
      this.sessionRepository.count({ where: { expiresAt: LessThan(now) } }),
    ]);
    return { totalActiveSessions, expiredSessions };
  }

  async countActive(): Promise<number> {
    return this.sessionRepository.count({ where: { expiresAt: MoreThan(new Date()) } });
  }

  private async findByToken(token: string, withUser: boolean): Promise<Session | null> {
    const hashed = this.tokenHashService.hashToken(token);
    const relations = withUser ? ['user'] : undefined;
    let session = await this.sessionRepository.findOne({ where: { token: hashed }, relations });
    if (session) return session;
    // Legacy: migrate sessions stored with unhashed token
    session = await this.sessionRepository.findOne({ where: { token }, relations });
    if (!session) return null;
    session.token = hashed;
    await this.sessionRepository.save(session);
    return session;
  }
}

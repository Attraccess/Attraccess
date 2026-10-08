import { runSerializedTransaction } from '../../../database/run-serialized-transaction';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Session, User, SsoSessionContext } from '@attraccess/database-entities';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { SessionStore, SessionMetadata, LogoutSession } from './session-store';

import { matchesSsoSession, SsoSessionSelector } from './sso-session-selector';

const LAST_ACCESSED_THROTTLE_MS = 60_000;

export class SqliteSessionStore implements SessionStore {
  constructor(
    private readonly sessionRepository: Repository<Session>,
    private readonly tokenHashService: TokenHashService,
  ) {}

  async createSession(
    hashedToken: string,
    userId: number,
    metadata: SessionMetadata | undefined,
    expiresAt: Date,
  ): Promise<void> {
    const session = this.sessionRepository.create({
      token: hashedToken,
      userId,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
      expiresAt,
      createdAt: new Date(),
      ssoContext: metadata?.ssoContext ?? null,
      ssoProviderId: metadata?.ssoContext?.providerId ?? null,
      ssoProtocol: metadata?.ssoContext?.protocol ?? null,
      ssoSubject:
        metadata?.ssoContext?.protocol === 'OIDC'
          ? metadata.ssoContext.subject
          : (metadata?.ssoContext?.nameID ?? null),
      ssoSessionId: metadata?.ssoContext?.protocol === 'OIDC' ? (metadata.ssoContext.sid ?? null) : null,
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
    // ponytail: skip write if within throttle window to reduce per-request DB pressure
    if (!session.lastAccessedAt || Date.now() - session.lastAccessedAt.getTime() > LAST_ACCESSED_THROTTLE_MS) {
      session.lastAccessedAt = new Date();
      await this.sessionRepository.update({ id: session.id }, { lastAccessedAt: session.lastAccessedAt });
    }
    return session.user;
  }

  async rotateSession(token: string, newHashedToken: string, newExpiresAt: Date): Promise<boolean> {
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update(Session)
      .set({ token: newHashedToken, expiresAt: newExpiresAt, lastAccessedAt: new Date() })
      .where('(token = :hashed OR token = :raw) AND expiresAt > :now', {
        hashed: this.tokenHashService.hashToken(token),
        raw: token,
        now: new Date(),
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  // Lowercase RETURNING statements use sqlite3.all in TypeORM's SQLite runner;
  // its uppercase mutation path uses sqlite3.run and discards returned rows.
  async revokeSession(token: string): Promise<boolean> {
    const rows = (await this.sessionRepository.query(
      'delete FROM "session" WHERE ("token" = ? OR "token" = ?) RETURNING "expiresAt"',
      [this.tokenHashService.hashToken(token), token],
    )) as { expiresAt: string }[];
    return rows.some((row) => new Date(row.expiresAt + 'Z') > new Date());
  }

  async getLogoutSession(token: string): Promise<LogoutSession | null> {
    const session = await this.sessionRepository
      .createQueryBuilder('session')
      .addSelect('session.ssoContext')
      .where('(session.token = :hashed OR session.token = :raw) AND session.expiresAt > :now', {
        hashed: this.tokenHashService.hashToken(token),
        raw: token,
        now: new Date(),
      })
      .getOne();
    return session ? { id: String(session.id), ssoContext: session.ssoContext ?? null } : null;
  }

  async revokeLogoutSession(id: string): Promise<boolean> {
    const rows = (await this.sessionRepository.query('delete FROM "session" WHERE "id" = ? RETURNING "expiresAt"', [
      id,
    ])) as { expiresAt: string }[];
    return rows.some((row) => new Date(row.expiresAt + 'Z') > new Date());
  }

  async getSsoContext(token: string): Promise<SsoSessionContext | null> {
    return (await this.getLogoutSession(token))?.ssoContext ?? null;
  }

  async revokeSsoSessions(selector: SsoSessionSelector): Promise<number> {
    const query = this.sessionRepository
      .createQueryBuilder('session')
      .addSelect('session.ssoContext')
      .where('session.ssoProviderId = :providerId AND session.ssoProtocol = :protocol', selector);
    if (selector.protocol === 'OIDC' && selector.sid)
      query.andWhere('session.ssoSessionId = :sid', { sid: selector.sid });
    const subject = selector.protocol === 'OIDC' ? selector.subject : selector.nameID;
    if (subject) query.andWhere('session.ssoSubject = :subject', { subject });
    const sessions = (await query.getMany()).filter((session) => matchesSsoSession(session.ssoContext, selector));
    if (!sessions.length) return 0;
    const placeholders = sessions.map(() => '?').join(',');
    const rows = (await this.sessionRepository.query(
      `delete FROM "session" WHERE "id" IN (${placeholders}) RETURNING "expiresAt"`,
      sessions.map((session) => session.id),
    )) as { expiresAt: string }[];
    return rows.filter((row) => new Date(row.expiresAt + 'Z') > new Date()).length;
  }

  async revokeSsoSessionsOnce(
    selector: SsoSessionSelector,
    receipt: { key: string; expiresAt: number; requireMatch?: boolean },
  ): Promise<{ fresh: boolean; count: number }> {
    return runSerializedTransaction(this.sessionRepository.manager, async (manager) => {
      const store = new SqliteSessionStore(manager.getRepository(Session), this.tokenHashService);
      // The receipt write acquires SQLite's writer lock before selecting sessions.
      // A failed delete rolls back the receipt so delivery can be retried safely.
      if (!(await store.putLogoutState(receipt.key, 'seen', receipt.expiresAt))) return { fresh: false, count: 0 };
      const count = await store.revokeSsoSessions(selector);
      if (receipt.requireMatch && count === 0) {
        // Keep the writer lock and discard the untrusted allocation in this same transaction.
        await store.takeLogoutState(receipt.key);
        return { fresh: false, count: 0 };
      }
      return { fresh: true, count };
    });
  }

  async putLogoutState(key: string, value: string, expiresAt: number): Promise<boolean> {
    if (expiresAt <= Date.now()) return false;
    await this.sessionRepository.query('delete FROM "sso_logout_state" WHERE "expiresAt" <= ?', [Date.now()]);
    const rows = (await this.sessionRepository.query(
      'insert INTO "sso_logout_state" ("key", "value", "expiresAt") VALUES (?, ?, ?) ON CONFLICT("key") DO NOTHING RETURNING "key"',
      [key, value, expiresAt],
    )) as { key: string }[];
    return rows.length === 1;
  }

  async takeLogoutState(key: string): Promise<string | null> {
    const rows = (await this.sessionRepository.query(
      'delete FROM "sso_logout_state" WHERE "key" = ? RETURNING "value", "expiresAt"',
      [key],
    )) as { value: string; expiresAt: number }[];
    return rows[0]?.expiresAt > Date.now() ? rows[0].value : null;
  }

  async revokeAllUserSessions(userId: number): Promise<number> {
    const rows = (await this.sessionRepository.query('delete FROM "session" WHERE "userId" = ? RETURNING "expiresAt"', [
      userId,
    ])) as { expiresAt: string }[];
    return rows.filter((row) => new Date(row.expiresAt + 'Z') > new Date()).length;
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
    const result = await this.sessionRepository.update({ id: session.id, token }, { token: hashed });
    return result.affected ? session : null;
  }
}

import { Repository, LessThan, MoreThan } from 'typeorm';
import { Session } from '@attraccess/database-entities';
import type {
  AuthenticatedSession,
  AuthenticatedSessionUser,
  LogoutSession,
  SessionMetadata,
  SessionStats,
  SsoLogoutReceipt,
  SsoSessionContext,
  SsoSessionSelector,
  UserSessionSummary,
} from '@attraccess/application-models';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { SessionStore } from '../../../users-and-auth/auth/session-store/session-store';
import { matchesSsoSession } from '../../../users-and-auth/auth/session-store/sso-session-selector';
import { toAuthenticatedSessionUser } from './typeorm-session-user-directory';

const LAST_ACCESSED_THROTTLE_MS = 60_000;

export class PostgresSessionStore implements SessionStore {
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

  async validateSession(token: string): Promise<AuthenticatedSessionUser | null> {
    return (await this.authenticateSession(token))?.user ?? null;
  }

  async authenticateSession(token: string): Promise<AuthenticatedSession | null> {
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
    return {
      user: toAuthenticatedSessionUser(session.user),
      session: { id: String(session.id), ssoContext: session.ssoContext ?? null },
    };
  }

  async rotateSession(token: string, newHashedToken: string, newExpiresAt: Date): Promise<boolean> {
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update(Session)
      .set({ token: newHashedToken, expiresAt: newExpiresAt, lastAccessedAt: new Date() })
      .where('("token" = :hashed OR "token" = :raw) AND "expiresAt" > :now', {
        hashed: this.tokenHashService.hashToken(token),
        raw: token,
        now: new Date(),
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** The deleted rows of a DELETE ... RETURNING "expiresAt" (TypeORM's runner returns `[rows, count]` for DELETE). */
  private async deleted(sql: string, params: unknown[]): Promise<{ expiresAt: Date }[]> {
    const result = (await this.sessionRepository.query(sql, params)) as unknown;
    return (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as { expiresAt: Date }[];
  }

  async revokeSession(token: string): Promise<boolean> {
    const rows = await this.deleted(
      'DELETE FROM "session" WHERE ("token" = $1 OR "token" = $2) RETURNING "expiresAt"',
      [this.tokenHashService.hashToken(token), token],
    );
    return rows.some((row) => row.expiresAt > new Date());
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
    const rows = await this.deleted('DELETE FROM "session" WHERE "id" = $1 RETURNING "expiresAt"', [Number(id)]);
    return rows.some((row) => row.expiresAt > new Date());
  }

  async getSsoContext(token: string): Promise<SsoSessionContext | null> {
    return (await this.getLogoutSession(token))?.ssoContext ?? null;
  }

  async compareAndSetSsoContext(id: string, expected: SsoSessionContext, next: SsoSessionContext): Promise<boolean> {
    // jsonb equality is by value (key order is irrelevant), so the expected context is a stable compare token.
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update(Session)
      .set({ ssoContext: next })
      .where('"id" = :id AND "ssoContext" = CAST(:expected AS jsonb) AND "expiresAt" > :now', {
        id: Number(id),
        expected: JSON.stringify(expected),
        now: new Date(),
      })
      .execute();
    return (result.affected ?? 0) > 0;
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
    const rows = await this.deleted('DELETE FROM "session" WHERE "id" = ANY($1::int[]) RETURNING "expiresAt"', [
      sessions.map((session) => session.id),
    ]);
    return rows.filter((row) => row.expiresAt > new Date()).length;
  }

  async revokeSsoSessionsOnce(
    selector: SsoSessionSelector,
    receipt: SsoLogoutReceipt,
  ): Promise<{ fresh: boolean; count: number }> {
    return this.sessionRepository.manager.transaction(async (manager) => {
      const store = new PostgresSessionStore(manager.getRepository(Session), this.tokenHashService);
      // The receipt is a unique key: a concurrent delivery of the same receipt waits for this transaction and then
      // finds the key taken. A failed delete rolls back the receipt so delivery can be retried safely.
      if (!(await store.putLogoutState(receipt.key, 'seen', receipt.expiresAt))) return { fresh: false, count: 0 };
      const count = await store.revokeSsoSessions(selector);
      if (receipt.requireMatch && count === 0) {
        // Discard the untrusted allocation in this same transaction.
        await store.takeLogoutState(receipt.key);
        return { fresh: false, count: 0 };
      }
      return { fresh: true, count };
    });
  }

  async putLogoutState(key: string, value: string, expiresAt: number): Promise<boolean> {
    if (expiresAt <= Date.now()) return false;
    await this.sessionRepository.query('DELETE FROM "sso_logout_state" WHERE "expiresAt" <= $1', [Date.now()]);
    const rows = (await this.sessionRepository.query(
      'INSERT INTO "sso_logout_state" ("key", "value", "expiresAt") VALUES ($1, $2, $3) ON CONFLICT("key") DO NOTHING RETURNING "key"',
      [key, value, expiresAt],
    )) as { key: string }[];
    return rows.length === 1;
  }

  async takeLogoutState(key: string): Promise<string | null> {
    const result = (await this.sessionRepository.query(
      'DELETE FROM "sso_logout_state" WHERE "key" = $1 RETURNING "value", "expiresAt"',
      [key],
    )) as unknown;
    const rows = (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as {
      value: string;
      expiresAt: number | string;
    }[];
    return rows[0] && Number(rows[0].expiresAt) > Date.now() ? rows[0].value : null;
  }

  async putEphemeralState(key: string, value: string, expiresAt: number): Promise<boolean> {
    return this.putLogoutState(key, value, expiresAt);
  }

  async getEphemeralState(key: string): Promise<string | null> {
    const rows = (await this.sessionRepository.query(
      'SELECT "value" FROM "sso_logout_state" WHERE "key" = $1 AND "expiresAt" > $2',
      [key, Date.now()],
    )) as { value: string }[];
    return rows[0]?.value ?? null;
  }

  async incrementEphemeralCounter(key: string, expiresAt: number): Promise<number> {
    if (expiresAt <= Date.now()) throw new Error('Ephemeral counter expiry must be in the future');
    await this.sessionRepository.query('DELETE FROM "sso_logout_state" WHERE "expiresAt" <= $1', [Date.now()]);
    const rows = (await this.sessionRepository.query(
      'INSERT INTO "sso_logout_state" ("key", "value", "expiresAt") VALUES ($1, \'1\', $2) ' +
        'ON CONFLICT("key") DO UPDATE SET "value" = (CAST("sso_logout_state"."value" AS INTEGER) + 1)::text RETURNING "value"',
      [key, expiresAt],
    )) as { value: string | number }[];
    return Number(rows[0].value);
  }

  async revokeAllUserSessions(userId: number): Promise<number> {
    const rows = await this.deleted('DELETE FROM "session" WHERE "userId" = $1 RETURNING "expiresAt"', [userId]);
    return rows.filter((row) => row.expiresAt > new Date()).length;
  }

  async cleanupExpired(): Promise<{ remainingActive: number }> {
    await this.sessionRepository.delete({ expiresAt: LessThan(new Date()) });
    const remainingActive = await this.sessionRepository.count({
      where: { expiresAt: MoreThan(new Date()) },
    });
    return { remainingActive };
  }

  async getUserSessions(userId: number): Promise<UserSessionSummary[]> {
    const sessions = await this.sessionRepository.find({
      where: { userId, expiresAt: MoreThan(new Date()) },
      order: { lastAccessedAt: 'DESC' },
    });
    return sessions.map((session) => ({
      userId: session.userId,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
    }));
  }

  async getStats(): Promise<SessionStats> {
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
    const find = (value: string) => {
      const query = this.sessionRepository.createQueryBuilder('session').addSelect('session.ssoContext');
      if (withUser) query.leftJoinAndSelect('session.user', 'user');
      return query.where('session.token = :token', { token: value }).getOne();
    };
    let session = await find(hashed);
    if (session) return session;
    // Legacy: migrate sessions stored with unhashed token
    session = await find(token);
    if (!session) return null;
    session.token = hashed;
    const result = await this.sessionRepository.update({ id: session.id, token }, { token: hashed });
    return result.affected ? session : null;
  }
}

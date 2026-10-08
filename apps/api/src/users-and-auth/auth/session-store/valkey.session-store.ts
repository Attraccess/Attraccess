import { Repository } from 'typeorm';
import { Session, User, SsoSessionContext } from '@attraccess/database-entities';
import type { Redis } from 'ioredis';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { SessionStore, SessionMetadata, LogoutSession } from './session-store';

import { createHash } from 'node:crypto';
import { SsoSessionSelector } from './sso-session-selector';
import {
  CREATE_SESSION_SCRIPT,
  ROTATE_SESSION_SCRIPT,
  REVOKE_SESSION_SCRIPT,
  REVOKE_LOGOUT_SESSION_SCRIPT,
  REVOKE_USER_SCRIPT,
  REVOKE_SSO_SCRIPT,
} from './valkey-session-scripts';

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

export class ValkeySessionStore implements SessionStore {
  constructor(
    private readonly client: Redis,
    private readonly userRepository: Repository<User>,
    private readonly tokenHashService: TokenHashService,
  ) {}

  async createSession(
    hashedToken: string,
    userId: number,
    metadata: SessionMetadata | undefined,
    expiresAt: Date,
  ): Promise<void> {
    const context = metadata?.ssoContext;
    const indexes = context
      ? [
          this.ssoIndex(
            context.providerId,
            context.protocol,
            'subject',
            context.protocol === 'OIDC' ? context.subject : context.nameID,
          ),
        ]
      : [];
    if (context?.protocol === 'OIDC' && context.sid)
      indexes.push(this.ssoIndex(context.providerId, context.protocol, 'sid', context.sid));
    const now = Date.now();
    const values = {
      userId: String(userId),
      lineageId: hashedToken,
      userAgent: metadata?.userAgent || '',
      ipAddress: metadata?.ipAddress || '',
      expiresAt: expiresAt.toISOString(),
      expiresAtMs: String(expiresAt.getTime()),
      createdAt: new Date(now).toISOString(),
      createdAtMs: String(now),
      ssoIndexes: JSON.stringify(indexes),
      ...(context ? { ssoContext: JSON.stringify(context) } : {}),
    };
    await this.client.eval(
      CREATE_SESSION_SCRIPT,
      1,
      `${SESSION_PREFIX}${hashedToken}`,
      now,
      hashedToken,
      JSON.stringify(values),
      expiresAt.getTime(),
    );
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
    const hashed = this.tokenHashService.hashToken(token);
    return (
      Number(
        await this.client.eval(
          ROTATE_SESSION_SCRIPT,
          2,
          `${SESSION_PREFIX}${hashed}`,
          `${SESSION_PREFIX}${newHashedToken}`,
          Date.now(),
          hashed,
          newHashedToken,
          newExpiresAt.getTime(),
          newExpiresAt.toISOString(),
        ),
      ) === 1
    );
  }

  async revokeSession(token: string): Promise<boolean> {
    const hashed = this.tokenHashService.hashToken(token);
    return (
      Number(await this.client.eval(REVOKE_SESSION_SCRIPT, 1, `${SESSION_PREFIX}${hashed}`, Date.now(), hashed)) === 1
    );
  }

  async revokeAllUserSessions(userId: number): Promise<number> {
    return Number(await this.client.eval(REVOKE_USER_SCRIPT, 1, `${USER_SESSIONS_PREFIX}${userId}`, Date.now()));
  }

  async getLogoutSession(token: string): Promise<LogoutSession | null> {
    const hashed = this.tokenHashService.hashToken(token);
    const data = await this.client.hgetall(`${SESSION_PREFIX}${hashed}`);
    if (!data.userId || new Date(data.expiresAt) <= new Date()) return null;
    return {
      id: data.lineageId || hashed,
      ssoContext: data.ssoContext ? (JSON.parse(data.ssoContext) as SsoSessionContext) : null,
    };
  }

  async revokeLogoutSession(id: string): Promise<boolean> {
    return (
      Number(await this.client.eval(REVOKE_LOGOUT_SESSION_SCRIPT, 1, `session_lineage:${id}`, Date.now(), id)) === 1
    );
  }

  async getSsoContext(token: string): Promise<SsoSessionContext | null> {
    return (await this.getLogoutSession(token))?.ssoContext ?? null;
  }

  async revokeSsoSessions(selector: SsoSessionSelector): Promise<number> {
    const kind = selector.protocol === 'OIDC' && selector.sid ? 'sid' : 'subject';
    const identity = selector.protocol === 'OIDC' ? selector.sid || selector.subject : selector.nameID;
    if (!identity) return 0;
    return Number(
      await this.client.eval(
        REVOKE_SSO_SCRIPT,
        1,
        this.ssoIndex(selector.providerId, selector.protocol, kind, identity),
        Date.now(),
        JSON.stringify(selector),
      ),
    );
  }

  async revokeSsoSessionsOnce(
    selector: SsoSessionSelector,
    receipt: { key: string; expiresAt: number },
  ): Promise<{ fresh: boolean; count: number }> {
    const kind = selector.protocol === 'OIDC' && selector.sid ? 'sid' : 'subject';
    const identity = selector.protocol === 'OIDC' ? selector.sid || selector.subject : selector.nameID;
    if (!identity) return { fresh: false, count: 0 };
    const result = (await this.client.eval(
      REVOKE_SSO_SCRIPT,
      1,
      this.ssoIndex(selector.providerId, selector.protocol, kind, identity),
      Date.now(),
      JSON.stringify(selector),
      `sso_logout_state:${receipt.key}`,
      receipt.expiresAt,
    )) as number[];
    return { fresh: result[0] === 1, count: result[1] };
  }

  async putLogoutState(key: string, value: string, expiresAt: number): Promise<boolean> {
    if (expiresAt <= Date.now()) return false;
    return (
      (await this.client.set(`sso_logout_state:${key}`, value, 'PX', Math.max(1, expiresAt - Date.now()), 'NX')) ===
      'OK'
    );
  }

  async takeLogoutState(key: string): Promise<string | null> {
    return (await this.client.call('GETDEL', `sso_logout_state:${key}`)) as string | null;
  }

  private ssoIndex(providerId: number, protocol: string, kind: string, identity: string): string {
    return `sso_sessions:${providerId}:${protocol}:${kind}:${createHash('sha256').update(identity).digest('hex')}`;
  }

  async cleanupExpired(): Promise<null> {
    // Session hashes expire through TTL. Sorted lookup indexes remove expired members
    // on reads/writes and during periodic cleanup, even if the hash is already gone.
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', 'sso_sessions:*', 'COUNT', 100);
      for (const key of keys) await this.client.zremrangebyscore(key, '-inf', Date.now());
      cursor = next;
    } while (cursor !== '0');
    return null;
  }

  async getUserSessions(userId: number): Promise<Session[]> {
    const hashedTokens = await this.client.smembers(`${USER_SESSIONS_PREFIX}${userId}`);
    const now = new Date();
    const sessions: Session[] = [];
    for (const ht of hashedTokens) {
      const data = await this.client.hgetall(`${SESSION_PREFIX}${ht}`);
      if (!data?.['userId']) {
        await this.client.srem(`${USER_SESSIONS_PREFIX}${userId}`, ht);
        continue;
      }
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

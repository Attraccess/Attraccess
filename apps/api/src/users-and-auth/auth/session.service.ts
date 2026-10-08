import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Session, User } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { SESSION_STORE, SessionStore, SessionMetadata } from './session-store/session-store';

import { SsoSessionSelector } from './session-store/sso-session-selector';

export type { SessionMetadata } from './session-store/session-store';

const DEFAULT_EXPIRATION_HOURS = 24;
const MAX_EXPIRATION_HOURS = 168; // 7 days

@Injectable()
export class SessionService implements OnModuleInit {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(SESSION_STORE) private readonly store: SessionStore,
    private readonly tokenHashService: TokenHashService,
    private readonly metricsService: MetricsService,
    private readonly cronTimer: CronTimer,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.store.countActive();
    this.metricsService.authActiveSessions.set(count);
  }

  async createSession(user: User, metadata?: SessionMetadata): Promise<string> {
    const token = this.generateSessionToken();
    const hashedToken = this.tokenHashService.hashToken(token);
    const expiresIn = Math.min(metadata?.expiresIn || DEFAULT_EXPIRATION_HOURS * 3600, MAX_EXPIRATION_HOURS * 3600);
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.store.createSession(hashedToken, user.id, metadata, expiresAt);
    this.metricsService.authActiveSessions.inc();
    this.logger.log(`Created session for user ${user.id} (${user.username}), expires at ${expiresAt.toISOString()}`);
    return token;
  }

  async validateSession(token: string): Promise<User | null> {
    if (!token) return null;
    return this.store.validateSession(token);
  }

  async refreshSession(token: string): Promise<string | null> {
    if (!token) return null;
    const newToken = this.generateSessionToken();
    const newHashedToken = this.tokenHashService.hashToken(newToken);
    const newExpiresAt = new Date(Date.now() + DEFAULT_EXPIRATION_HOURS * 3600 * 1000);
    const success = await this.store.rotateSession(token, newHashedToken, newExpiresAt);
    if (!success) return null;
    this.logger.log('Refreshed session');
    return newToken;
  }

  async revokeSession(token: string): Promise<void> {
    if (!token) return;
    const wasActive = await this.store.revokeSession(token);
    if (wasActive) this.metricsService.authActiveSessions.dec();
    this.logger.log('Revoked session');
  }

  async revokeAllUserSessions(userId: number): Promise<void> {
    const activeCount = await this.store.revokeAllUserSessions(userId);
    if (activeCount > 0) this.metricsService.authActiveSessions.dec(activeCount);
    this.logger.log(`Revoked sessions for user ${userId}`);
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupExpiredSessions(): Promise<void> {
    await this.cronTimer.time('session_cleanup', async () => {
      const result = await this.store.cleanupExpired();
      if (result !== null) {
        this.metricsService.authActiveSessions.set(result.remainingActive);
      }
    });
  }

  async getLogoutSession(token: string) {
    return token ? this.store.getLogoutSession(token) : null;
  }

  async revokeLogoutSession(id: string): Promise<void> {
    if (await this.store.revokeLogoutSession(id)) this.metricsService.authActiveSessions.dec();
  }

  async getSsoContext(token: string) {
    return token ? this.store.getSsoContext(token) : null;
  }

  async revokeSsoSessionsOnce(
    selector: SsoSessionSelector,
    receipt: { key: string; expiresAt: number },
  ): Promise<boolean> {
    const result = await this.store.revokeSsoSessionsOnce(selector, receipt);
    if (result.count) this.metricsService.authActiveSessions.dec(result.count);
    return result.fresh;
  }

  async revokeSsoSessions(selector: SsoSessionSelector): Promise<number> {
    const count = await this.store.revokeSsoSessions(selector);
    if (count) this.metricsService.authActiveSessions.dec(count);
    return count;
  }

  async getUserSessions(userId: number): Promise<Session[]> {
    return this.store.getUserSessions(userId);
  }

  async getSessionStats(): Promise<{ totalActiveSessions: number; expiredSessions: number }> {
    return this.store.getStats();
  }

  private generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }
}

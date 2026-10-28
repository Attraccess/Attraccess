import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SSOProvider, SsoSessionContext } from '@attraccess/database-entities';
import { SessionConfigType } from '../../../config/session.config';
import { MetricsService } from '../../../metrics/metrics.service';
import { SsoAuditService } from '../../../audit/sso-audit.service';
import { SessionService } from '../session.service';
import { LogoutSession } from '../session-store/session-store';
import { recordSsoProvisioningAudit } from './audit/provider-audit';
import {
  RoleDelta,
  SESSION_PERMISSION_RESYNCERS,
  SessionPermissionResyncer,
  SessionPermissionSync,
  SessionPermissionSyncOutcome,
  SessionRejectedError,
  resolvePermissionSyncIntervalMinutes,
} from './session-permission-sync';

type LoadedProvider = { provider: SSOProvider; permissionSyncTtlMinutes?: number | null };

const PROVIDER_CACHE_MS = 30_000;
const RETRY_AFTER_FAILURE_MS = 60_000;
const FORCED_SYNC_MIN_INTERVAL_MS = 60_000;

/**
 * Re-evaluates an SSO session's roles once the provider's re-sync interval has elapsed. Owns the
 * protocol-agnostic parts (scheduling, claiming, backoff, revocation, metrics, audit) and delegates
 * the IdP round trip to the SessionPermissionResyncer registered for the session's protocol.
 */
@Injectable()
export class SsoSessionPermissionSyncService implements SessionPermissionSync {
  private readonly logger = new Logger(SsoSessionPermissionSyncService.name);
  private readonly providers = new Map<string, { expires: number; provider: LoadedProvider | null }>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    @Inject(SESSION_PERMISSION_RESYNCERS) private readonly resyncers: SessionPermissionResyncer[],
    @Optional() private readonly ssoAudit?: SsoAuditService,
  ) {}

  /**
   * `force` (session refresh) re-syncs regardless of the interval, at most once per minute.
   * Never throws: a re-sync problem must not lock users out, they keep their current roles.
   */
  async syncIfDue(
    session: LogoutSession,
    userId: number,
    options: { force?: boolean } = {},
  ): Promise<SessionPermissionSyncOutcome> {
    try {
      return await this.attempt(session, userId, options);
    } catch (error) {
      this.logger.warn(`SSO permission re-sync skipped: ${error instanceof Error ? error.message : String(error)}`);
      return 'skipped';
    }
  }

  private async attempt(
    session: LogoutSession,
    userId: number,
    options: { force?: boolean },
  ): Promise<SessionPermissionSyncOutcome> {
    const context = session.ssoContext;
    const resyncer = context && this.resyncers.find((candidate) => candidate.protocol === context.protocol);
    if (!context || !resyncer?.canResync(context)) return 'skipped';
    const loaded = await this.provider(resyncer, context.providerId);
    const sessionConfig = this.configService.get<SessionConfigType>('session');
    const intervalMs = loaded ? resolvePermissionSyncIntervalMinutes(loaded, sessionConfig) * 60_000 : 0;
    if (!loaded || intervalMs <= 0) return 'skipped';
    const { provider } = loaded;
    const providerType = context.protocol.toLowerCase();

    const now = Date.now();
    // A pending failure backoff applies to forced (session refresh) attempts as well.
    const dueAt =
      context.ssoSyncRetryAt ??
      (context.lastSsoSyncAt ?? 0) + (options.force ? Math.min(intervalMs, FORCED_SYNC_MIN_INTERVAL_MS) : intervalMs);
    if (now < dueAt) return 'skipped';

    // Claim the attempt first so concurrent requests and replicas never replay one refresh token.
    const claimed: SsoSessionContext = { ...context, lastSsoSyncAt: now, ssoSyncRetryAt: undefined };
    if (!(await this.sessionService.compareAndSetSsoContext(session.id, context, claimed))) {
      // Normal under concurrency, but a store whose compare-and-set never matches would show up here too.
      this.metricsService.authSsoPermissionResyncTotal.inc({ provider_type: providerType, outcome: 'claim_lost' });
      return 'skipped';
    }
    session.ssoContext = claimed;

    let outcome: SessionPermissionSyncOutcome;
    let changes: RoleDelta | undefined;
    try {
      changes = await resyncer.resync({
        context: claimed,
        userId,
        provider,
        patchContext: (patch) => this.updateContext(session, userId, patch),
      });
      outcome = changes.added.length + changes.removed.length + changes.updated.length > 0 ? 'updated' : 'unchanged';
      if (outcome === 'updated') await this.recordAudit('permissions_synced', provider, userId, changes);
    } catch (error) {
      if (error instanceof SessionRejectedError) {
        // Fail closed: this request is rejected even if removing the stored session fails.
        outcome = 'revoked';
        try {
          await this.sessionService.revokeLogoutSession(session.id);
          await this.recordAudit('sessions_revoked', provider, userId, { sessionsRevoked: true });
        } catch (revokeError) {
          this.logger.error(`Failed to revoke session rejected by the IdP for user ${userId}`, revokeError);
        }
      } else {
        outcome = 'failed';
        // Transient IdP/network failure: keep the session and current roles, retry after a short backoff.
        // Compare against the current context, which may already hold a rotated refresh token.
        const current = session.ssoContext as SsoSessionContext;
        const retry: SsoSessionContext = { ...current, ssoSyncRetryAt: now + RETRY_AFTER_FAILURE_MS };
        if (await this.sessionService.compareAndSetSsoContext(session.id, current, retry).catch(() => false))
          session.ssoContext = retry;
      }
      this.logger.warn(
        `SSO permission re-sync ${outcome} for user ${userId} (provider ${provider.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (outcome === 'updated' || outcome === 'unchanged') {
      this.logger.log(
        `SSO permission re-sync ${outcome} for user ${userId} (provider ${provider.id})${changes && outcome === 'updated' ? `: ${JSON.stringify(changes)}` : ''}`,
      );
    }
    this.metricsService.authSsoPermissionResyncTotal.inc({ provider_type: providerType, outcome });
    return outcome;
  }

  private async updateContext(
    session: LogoutSession,
    userId: number,
    patch: Partial<SsoSessionContext>,
  ): Promise<void> {
    const current = session.ssoContext as SsoSessionContext;
    const next = { ...current, ...patch } as SsoSessionContext;
    if (await this.sessionService.compareAndSetSsoContext(session.id, current, next)) {
      session.ssoContext = next;
      return;
    }
    this.logger.warn(
      `SSO session context update lost its compare-and-set for user ${userId}; a rotated refresh token may not have been stored`,
    );
  }

  // Checked on every authenticated request, so provider settings are cached briefly.
  private async provider(resyncer: SessionPermissionResyncer, providerId: number): Promise<LoadedProvider | null> {
    const key = `${resyncer.protocol}:${providerId}`;
    const cached = this.providers.get(key);
    if (cached && cached.expires > Date.now()) return cached.provider;
    const provider = await resyncer.loadProvider(providerId);
    this.providers.set(key, { expires: Date.now() + PROVIDER_CACHE_MS, provider });
    return provider;
  }

  private async recordAudit(
    action: 'permissions_synced' | 'sessions_revoked',
    provider: SSOProvider,
    userId: number,
    changes: RoleDelta | { sessionsRevoked: true },
  ): Promise<void> {
    if (!this.ssoAudit) return;
    try {
      await recordSsoProvisioningAudit(this.ssoAudit, action, userId, provider, changes);
    } catch (error) {
      this.logger.warn(
        `Failed to record SSO permission re-sync audit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

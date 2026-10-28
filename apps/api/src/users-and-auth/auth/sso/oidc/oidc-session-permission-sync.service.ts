import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderType,
  SsoSessionContext,
} from '@attraccess/database-entities';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { SessionConfigType } from '../../../../config/session.config';
import { EncryptionService } from '../../../../encryption/encryption.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { SsoAuditService } from '../../../../audit/sso-audit.service';
import { RbacService } from '../../../rbac/rbac.service';
import { SessionService } from '../../session.service';
import { LogoutSession } from '../../session-store/session-store';
import { ssoAuditSnapshot } from '../audit/provider-audit';
import { resolveSsoRoleAssignments } from '../permission-mapping';
import { SSOService } from '../sso.service';
import { SessionPermissionSync, SessionPermissionSyncOutcome } from '../session-permission-sync';
import { OidcTokenVerifier } from './oidc-token-verifier.service';
import { getOidcPermissionClaimValues, resolveOidcRoleNames } from './oidc-permission-claims';

type OidcSessionContext = Extract<SsoSessionContext, { protocol: 'OIDC' }>;
type RoleDelta = { added: string[]; removed: string[]; updated: string[] };

const PROVIDER_CACHE_MS = 30_000;
const RETRY_AFTER_FAILURE_MS = 60_000;
const FORCED_SYNC_MIN_INTERVAL_MS = 60_000;
const IDP_REQUEST_OPTIONS = {
  timeout: 5000,
  maxContentLength: 262144,
  maxBodyLength: 262144,
  maxRedirects: 0,
  responseType: 'json' as const,
  validateStatus: () => true,
};

/** The IdP no longer vouches for the session (invalid_grant or a different subject). */
class OidcSessionRejectedError extends Error {}

/**
 * Re-evaluates an OIDC session's SSO roles with its refresh token once the provider's
 * re-sync interval has elapsed, using the same claim → role mapping as login.
 */
@Injectable()
export class OidcSessionPermissionSyncService implements SessionPermissionSync {
  private readonly logger = new Logger(OidcSessionPermissionSyncService.name);
  private readonly providers = new Map<number, { expires: number; provider: SSOProvider | null }>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly ssoService: SSOService,
    private readonly rbacService: RbacService,
    private readonly tokenVerifier: OidcTokenVerifier,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
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
    if (context?.protocol !== 'OIDC' || !context.refreshTokenEncrypted) return 'skipped';
    const provider = await this.provider(context.providerId);
    const config = provider?.oidcConfiguration;
    const intervalMs = config ? this.intervalMinutes(config) * 60_000 : 0;
    if (!provider || !config || intervalMs <= 0) return 'skipped';

    const now = Date.now();
    // A pending failure backoff applies to forced (session refresh) attempts as well.
    const dueAt =
      context.ssoSyncRetryAt ??
      (context.lastSsoSyncAt ?? 0) + (options.force ? Math.min(intervalMs, FORCED_SYNC_MIN_INTERVAL_MS) : intervalMs);
    if (now < dueAt) return 'skipped';

    // Claim the attempt first so concurrent requests and replicas never replay one refresh token.
    const claimed: OidcSessionContext = { ...context, lastSsoSyncAt: now, ssoSyncRetryAt: undefined };
    if (!(await this.sessionService.compareAndSetSsoContext(session.id, context, claimed))) return 'skipped';
    session.ssoContext = claimed;

    let outcome: SessionPermissionSyncOutcome;
    let changes: RoleDelta | undefined;
    try {
      changes = await this.resync(session, claimed, userId, provider, config);
      outcome = changes.added.length + changes.removed.length + changes.updated.length > 0 ? 'updated' : 'unchanged';
      if (outcome === 'updated') await this.recordAudit('permissions_synced', provider, userId, changes);
    } catch (error) {
      if (error instanceof OidcSessionRejectedError) {
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
        const current = session.ssoContext as OidcSessionContext;
        const retry: OidcSessionContext = { ...current, ssoSyncRetryAt: now + RETRY_AFTER_FAILURE_MS };
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
    this.metricsService.authSsoPermissionResyncTotal.inc({ provider_type: 'oidc', outcome });
    return outcome;
  }

  private async resync(
    session: LogoutSession,
    claimed: OidcSessionContext,
    userId: number,
    provider: SSOProvider,
    config: SSOProviderOIDCConfiguration,
  ): Promise<RoleDelta> {
    const refreshToken = this.encryptionService.decryptIfEncrypted(claimed.refreshTokenEncrypted) ?? '';
    const tokens = await this.refresh(config, refreshToken);
    // Persist a rotated refresh token before any further IdP call: the old one may already be invalid,
    // and replaying it after a transient failure would revoke the session.
    if (tokens.refreshToken) {
      await this.updateContext(session, { refreshTokenEncrypted: this.encryptionService.encrypt(tokens.refreshToken) });
    }

    const claimSources: unknown[] = [await this.userInfo(config, claimed.subject, tokens.accessToken)];
    if (tokens.idToken) {
      const claims = await this.tokenVerifier.verify(tokens.idToken, config);
      if (claims.sub !== claimed.subject || 'events' in claims)
        throw new OidcSessionRejectedError('Refreshed ID token does not identify the session subject');
      claimSources.push(claims);
      await this.updateContext(session, { idTokenEncrypted: this.encryptionService.encrypt(tokens.idToken) });
    }

    const claimValues = getOidcPermissionClaimValues(claimSources, config.clientId);
    // Same rule as login: a wholly absent role/group claim must not revoke anything.
    if (claimValues.length === 0) {
      this.logger.debug(`SSO permission re-sync for user ${userId}: no role/group claims returned; roles kept`);
      return { added: [], removed: [], updated: [] };
    }
    const roleAssignments = resolveSsoRoleAssignments(resolveOidcRoleNames(claimValues), config.roleMappings);
    return this.rbacService.syncSsoRoles(userId, roleAssignments, SSOProviderType.OIDC, provider.id);
  }

  private async updateContext(session: LogoutSession, patch: Partial<OidcSessionContext>): Promise<void> {
    const current = session.ssoContext as OidcSessionContext;
    const next: OidcSessionContext = { ...current, ...patch };
    if (await this.sessionService.compareAndSetSsoContext(session.id, current, next)) session.ssoContext = next;
  }

  private async refresh(
    config: SSOProviderOIDCConfiguration,
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken?: string; idToken?: string }> {
    // Same client authentication as the login code exchange (client_secret_post).
    const response = await axios.post<Record<string, unknown>>(
      config.tokenURL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
      {
        ...IDP_REQUEST_OPTIONS,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      },
    );
    const body = response.data && typeof response.data === 'object' ? response.data : {};
    if (body.error === 'invalid_grant') throw new OidcSessionRejectedError('Refresh token rejected (invalid_grant)');
    if (response.status !== 200 || typeof body.access_token !== 'string' || !body.access_token) {
      throw new Error(
        `Token endpoint returned HTTP ${response.status}${typeof body.error === 'string' ? ` (${body.error})` : ''}`,
      );
    }
    return {
      accessToken: body.access_token,
      ...(typeof body.refresh_token === 'string' && body.refresh_token ? { refreshToken: body.refresh_token } : {}),
      ...(typeof body.id_token === 'string' && body.id_token ? { idToken: body.id_token } : {}),
    };
  }

  private async userInfo(
    config: SSOProviderOIDCConfiguration,
    subject: string,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const response = await axios.get<Record<string, unknown>>(config.userInfoURL, {
      ...IDP_REQUEST_OPTIONS,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (response.status !== 200 || !response.data || typeof response.data !== 'object') {
      throw new Error(`Userinfo endpoint returned HTTP ${response.status}`);
    }
    if (response.data.sub !== subject) throw new OidcSessionRejectedError('Userinfo subject mismatch');
    return response.data;
  }

  private intervalMinutes(config: SSOProviderOIDCConfiguration): number {
    return (
      config.permissionSyncTtlMinutes ??
      this.configService.get<SessionConfigType>('session')?.SSO_PERMISSION_SYNC_TTL_MINUTES ??
      0
    );
  }

  // Checked on every authenticated request, so provider settings are cached briefly.
  private async provider(providerId: number): Promise<SSOProvider | null> {
    const cached = this.providers.get(providerId);
    if (cached && cached.expires > Date.now()) return cached.provider;
    const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(SSOProviderType.OIDC, providerId);
    this.providers.set(providerId, { expires: Date.now() + PROVIDER_CACHE_MS, provider });
    return provider;
  }

  private async recordAudit(
    action: 'permissions_synced' | 'sessions_revoked',
    provider: SSOProvider,
    userId: number,
    changes: RoleDelta | { sessionsRevoked: true },
  ): Promise<void> {
    try {
      await this.ssoAudit?.record({
        action: `sso.provisioning.${action}`,
        operationId: randomUUID(),
        actorId: null,
        authenticationMethod: null,
        subject: { type: 'user', id: userId },
        details: { provider: ssoAuditSnapshot(provider), changes: JSON.stringify(changes) },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record SSO permission re-sync audit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

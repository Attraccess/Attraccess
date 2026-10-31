import { SsoSessionRequest } from '../sso-session-request';
import { OidcTokenVerifier, OidcVerificationUnavailableError } from './oidc-token-verifier.service';
import { EncryptionService } from '../../../../encryption/encryption.service';
import { SSOProviderOIDCConfiguration, SSOProviderType, User } from '@attraccess/database-entities';

import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { ModuleRef } from '@nestjs/core';

import { Profile, Strategy } from 'passport-openidconnect';

import { MetricsService } from '../../../../metrics/metrics.service';

import { SsoAccountResolver } from '../account-resolution/sso-account-resolver.service';

import { classifySsoFailureReason, markSsoFailureMetricRecorded, recordSsoLoginFailure } from '../sso-metrics';

import { OidcCookieStateStore, OIDCAppState } from './oidc-cookie-state-store';

import { SsoAuditService } from '../../../../audit/sso-audit.service';

import { RbacService } from '../../../rbac/rbac.service';

import { syncOidcRolesFromClaims } from './oidc-permission-claims';

import { recordSsoProvisioningAudit } from '../audit/provider-audit';

import { resolvePermissionSyncIntervalMinutes } from '../session-permission-sync';

import { SSOService } from '../sso.service';

import { get } from 'lodash-es';

import { PassportStrategy } from '@nestjs/passport';

/** Request key set by SSOOIDCGuard so the strategy uses the per-request callback URL (current settings, no restart needed). */
export const SSO_OIDC_CALLBACK_URL_REQUEST_KEY = '_ssoOidcCallbackUrl';

/** Request key set by SSOOIDCGuard for login route: state to pass to OIDC (e.g. { redirectTo }). */
export const SSO_OIDC_STATE_REQUEST_KEY = '_ssoOidcState';

@Injectable()
export class SSOOIDCStrategy extends PassportStrategy(Strategy, 'sso-oidc', 8) {
  constructor(
    protected moduleRef: ModuleRef,
    config: SSOProviderOIDCConfiguration,
    callbackURL: string,
    stateStore: OidcCookieStateStore,
  ) {
    const configuredScopes = config.scopes && config.scopes.length > 0 ? config.scopes : ['openid', 'email', 'profile'];
    // passport-openidconnect always prepends `openid` to the scope param, so strip it from the
    // configured list to avoid sending `scope=openid openid email profile`.
    const scopeWithoutOpenid = configuredScopes.filter((s) => s.trim().toLowerCase() !== 'openid');

    super({
      passReqToCallback: true,
      issuer: config.issuer,
      authorizationURL: config.authorizationURL,
      userInfoURL: config.userInfoURL,
      tokenURL: config.tokenURL,
      clientID: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL,
      scope: scopeWithoutOpenid,
      store: stateStore,
      // Force userinfo endpoint fetch — the library otherwise skips it unless the verify
      // callback has arity ≥ 9. Some IdPs only return `email` from userinfo, not the id_token.
      skipUserProfile: false,
    });

    this.logger.log(`Initialized OIDC strategy with issuer: ${config.issuer} and callbackURL: ${callbackURL}`);
    this.config = config;
  }

  protected readonly logger = new Logger(SSOOIDCStrategy.name);

  protected readonly config: SSOProviderOIDCConfiguration;

  /**
   * Use per-request callback URL and state from the guard when set (so frontend/backend URL changes apply without restart).
   * State encodes redirectTo for fixed callback URIs (OIDC spec: use state param instead of redirect_uri query).
   */
  authenticate(
    req: Parameters<InstanceType<typeof Strategy>['authenticate']>[0],
    options?: Parameters<InstanceType<typeof Strategy>['authenticate']>[1],
  ): void {
    const reqExt = req as unknown as Record<string, unknown>;
    const dynamicCallback = reqExt[SSO_OIDC_CALLBACK_URL_REQUEST_KEY] as string | undefined;
    const stateFromGuard = reqExt[SSO_OIDC_STATE_REQUEST_KEY];
    if (!dynamicCallback && !this.isOIDCAppState(stateFromGuard)) {
      return super.authenticate(req, options);
    }
    const opts = { ...options };
    if (dynamicCallback) opts.callbackURL = dynamicCallback;
    if (this.isOIDCAppState(stateFromGuard)) opts.state = stateFromGuard;
    super.authenticate(req, opts);
  }

  protected recordFailure(error: unknown): void {
    try {
      const metricsService = this.moduleRef.get(MetricsService, { strict: false });
      recordSsoLoginFailure(metricsService, SSOProviderType.OIDC, classifySsoFailureReason(error), this.logger);
      markSsoFailureMetricRecorded(error);
    } catch (metricsError) {
      this.logger.warn(
        `Failed to resolve MetricsService for SSO login failure metric: ${metricsError instanceof Error ? metricsError.message : String(metricsError)}`,
      );
    }
  }

  // Explicit eight-argument Passport verify callback: req, issuer, profile, context, id_token, access_token,
  // refresh_token, done. The refresh token enables session-time permission re-sync.
  async validate(
    req: SsoSessionRequest,
    issuer: string,
    profile: Profile,
    context: unknown,
    idToken: string,
    _accessToken?: string,
    refreshToken?: string,
  ): Promise<User> {
    const verifier = this.moduleRef.get(OidcTokenVerifier, { strict: false });
    let claims: Record<string, unknown> | undefined;
    try {
      claims = await verifier.verify(idToken, this.config);
      if (claims.sub !== profile.id || issuer !== this.config.issuer || 'events' in claims)
        throw new UnauthorizedException('Invalid OIDC identity');
      const encryption = this.moduleRef.get(EncryptionService, { strict: false });
      req.ssoSessionContext = {
        protocol: 'OIDC',
        providerId: this.config.ssoProviderId,
        issuer: this.config.issuer,
        subject: profile.id,
        providerIssuedAt: Number(claims.iat) * 1000,
        ...(typeof claims.sid === 'string' && claims.sid ? { sid: claims.sid } : {}),
        idTokenEncrypted: encryption.encrypt(idToken),
        ...(refreshToken ? { refreshTokenEncrypted: encryption.encrypt(refreshToken) } : {}),
        lastSsoSyncAt: Date.now(),
      };
    } catch (error) {
      // Old providers without usable discovery/JWKS retain their existing OAuth login path,
      // but cannot participate in logout correlation. Explicit JWKS configuration fails closed.
      if (this.config.jwksURL || !(error instanceof OidcVerificationUnavailableError))
        throw new UnauthorizedException('OIDC ID token verification failed');
      this.logger.warn('OIDC ID token could not be verified; central logout unavailable for this session');
      delete req.ssoSessionContext;
      claims = undefined;
    }
    const user = await this.validateProfile(issuer, profile, context, claims);
    if (req.ssoSessionContext && !refreshToken) this.reportMissingRefreshToken();
    return user;
  }

  /** Re-sync is enabled for this provider but the IdP issued no refresh token, so the session can never be re-synced. */
  private reportMissingRefreshToken(): void {
    try {
      if (resolvePermissionSyncIntervalMinutes(this.config) <= 0) return;
      this.logger.warn(
        `OIDC provider ${this.config.ssoProviderId} has permission re-sync enabled but issued no refresh token; this session will not be re-synced (request the offline_access scope or enable refresh tokens at the IdP)`,
      );
      this.moduleRef
        .get(MetricsService, { strict: false })
        .authSsoRefreshTokenMissingTotal.inc({ provider_type: 'oidc' });
    } catch (error) {
      this.logger.warn(
        `Failed to report missing OIDC refresh token: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async validateProfile(
    _issuer: string,
    profile: Profile,
    _context?: unknown,
    idTokenClaims?: Record<string, unknown>,
  ): Promise<User> {
    this.logger.log(`Validating OIDC profile for issuer: ${_issuer}`);

    const oidcUserId = profile.id;

    if (!oidcUserId) {
      this.logger.error('No user ID found in SSO profile');
      const error = new BadRequestException('No user ID found in SSO profile');
      this.recordFailure(error);
      throw error;
    }

    // Build candidate sources to resolve claims from
    const claimSources: unknown[] = [profile];
    const raw = profile && '_json' in profile && profile._json ? profile._json : undefined;
    if (raw) claimSources.push(raw);
    if (idTokenClaims) claimSources.push(idTokenClaims);

    // Resolve email via configured or default paths
    const defaultEmailPaths = ['email', 'emails[0].value', 'upn'];
    const emailPaths =
      this.config.emailClaimPaths && this.config.emailClaimPaths.length > 0
        ? this.config.emailClaimPaths
        : defaultEmailPaths;
    let email = this.firstNonEmptyStringFromPaths(emailPaths, claimSources);
    if (!email && Array.isArray(profile.emails) && profile.emails.length > 0) {
      email = profile.emails[0]?.value;
    }
    if (!email) {
      this.logger.error('No email could be resolved from SSO profile');
      const error = new BadRequestException('No email found in SSO profile');
      this.recordFailure(error);
      throw error;
    }

    const defaultUsernamePaths = ['preferred_username', 'email', 'sub'];
    const usernamePaths =
      this.config.usernameClaimPaths && this.config.usernameClaimPaths.length > 0
        ? this.config.usernameClaimPaths
        : defaultUsernamePaths;
    const resolvedUsername = this.firstNonEmptyStringFromPaths(usernamePaths, claimSources);

    const resolver = this.moduleRef.get(SsoAccountResolver, { strict: false });
    const { user, created } = await resolver
      .resolveSsoUser({
        providerType: SSOProviderType.OIDC,
        providerId: this.config.ssoProviderId,
        subject: oidcUserId,
        email,
        emailVerified: this.resolveEmailVerified(idTokenClaims, raw as Record<string, unknown> | undefined),
        usernameClaim: resolvedUsername || profile.username || email,
      })
      .catch((error: unknown) => {
        if (error instanceof UnauthorizedException) this.recordFailure(error);
        throw error;
      });

    if (created) {
      this.logger.log(`New user (ID: ${user.id}) created successfully with SSO subject: ${oidcUserId}`);
      await this.recordProvisioningAudit(user.id, true);
    }
    return await this.syncPermissionsFromClaims(user, claimSources);
  }

  /** `email_verified` from the id-token claims and userinfo; any explicit "false" wins, absent/other = undefined. */
  protected resolveEmailVerified(...sources: Array<Record<string, unknown> | undefined>): boolean | undefined {
    const states = sources.map((source) => {
      const value = source?.email_verified;
      if (typeof value === 'boolean') return value;
      if (typeof value !== 'string') return undefined;
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' ? true : normalized === 'false' ? false : undefined;
    });
    if (states.includes(false)) return false;
    return states.includes(true) ? true : undefined;
  }

  protected async syncPermissionsFromClaims(user: User, claimSources: unknown[], userCreated = false): Promise<User> {
    const rbacService = this.moduleRef.get(RbacService, { strict: false });
    let changes: { added: string[]; removed: string[]; updated: string[] } | undefined;
    if (!rbacService) {
      this.logger.warn('RbacService not available via ModuleRef — SSO role sync skipped; existing roles preserved');
    } else {
      changes = await syncOidcRolesFromClaims(rbacService, user.id, this.config, claimSources);
    }
    await this.recordProvisioningAudit(user.id, userCreated, changes);
    return user;
  }

  protected async recordProvisioningAudit(
    userId: number,
    userCreated: boolean,
    changes?: { added: string[]; removed: string[]; updated: string[] },
  ): Promise<void> {
    try {
      const ssoService = this.moduleRef.get(SSOService, { strict: false });
      const audit = this.moduleRef.get(SsoAuditService, { strict: false });
      const provider = await ssoService?.getProviderByTypeAndIdWithConfiguration(
        SSOProviderType.OIDC,
        this.config.ssoProviderId,
      );
      if (!audit || !provider) return;
      if (userCreated) await recordSsoProvisioningAudit(audit, 'user_created', userId, provider, { userCreated: true });
      if (changes) await recordSsoProvisioningAudit(audit, 'permissions_synced', userId, provider, changes);
    } catch (error) {
      this.logger.warn(
        `Failed to record committed OIDC provisioning audit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected isOIDCAppState(value: unknown): value is OIDCAppState {
    return (
      value !== null &&
      typeof value === 'object' &&
      (!('redirectTo' in value) || typeof (value as OIDCAppState).redirectTo === 'string')
    );
  }

  protected firstNonEmptyStringFromPaths(paths: string[], sources: unknown[]): string | undefined {
    for (const p of paths) {
      for (const src of sources) {
        const value = get(src, p);
        if (typeof value === 'string' && value.trim().length > 0) {
          return value;
        }
      }
    }
    return undefined;
  }
}

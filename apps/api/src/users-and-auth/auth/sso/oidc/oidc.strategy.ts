import { AuthenticationType, SSOProviderOIDCConfiguration, SSOProviderType, User } from '@attraccess/database-entities';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Profile, Strategy } from 'passport-openidconnect';
import { MetricsService } from '../../../../metrics/metrics.service';
import { UsersService } from '../../../users/users.service';
import { AuthService } from '../../auth.service';
import { classifySsoFailureReason, markSsoFailureMetricRecorded, recordSsoLoginFailure } from '../sso-metrics';
import { AccountLinkingRequiredException } from './exceptions/account-linking-required.exception';
import { OidcCookieStateStore } from './oidc-cookie-state-store';
import { OidcRoleProvisioningImplementation } from './oidc-role-provisioning';
import { SSO_OIDC_CALLBACK_URL_REQUEST_KEY, SSO_OIDC_STATE_REQUEST_KEY } from './oidc.strategy.route-context';

@Injectable()
export class SSOOIDCStrategy extends OidcRoleProvisioningImplementation {
  protected readonly logger = new Logger(SSOOIDCStrategy.name);
  protected readonly config: SSOProviderOIDCConfiguration;

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

  async validate(_issuer: string, profile: Profile, _context?: unknown, idToken?: string): Promise<User> {
    this.logger.log(`Validating OIDC profile for issuer: ${_issuer}`);

    const oidcUserId = profile.id;

    if (!oidcUserId) {
      this.logger.error('No user ID found in SSO profile');
      const error = new BadRequestException('No user ID found in SSO profile');
      this.recordFailure(error);
      throw error;
    }

    const usersService = await this.moduleRef.get(UsersService, { strict: false });
    const authService = await this.moduleRef.get(AuthService, { strict: false });

    // Build candidate sources to resolve claims from
    const claimSources: unknown[] = [profile];
    const raw = profile && '_json' in profile && profile._json ? profile._json : undefined;
    if (raw) claimSources.push(raw);
    const idTokenClaims = this.parseIdTokenClaims(idToken);
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

    // Step 1: Check if user exists by SSO auth detail
    this.logger.debug(`Checking if user exists with SSO binding: ${oidcUserId}`);
    const existingUserId = await authService.findUserIdBySSO(
      SSOProviderType.OIDC,
      this.config.ssoProviderId,
      oidcUserId,
    );
    let user = existingUserId ? await usersService.findOne({ id: existingUserId }) : null;

    if (user) {
      this.logger.log(`Found existing user with SSO binding: ${oidcUserId}`);
      return await this.syncPermissionsFromClaims(user, claimSources);
    }

    // Step 2: No user found by external ID, check by email
    this.logger.debug(`Checking if user exists with email: ${email}`);
    user = await usersService.findOne({ email }, ['authenticationDetails']).catch(() => null);

    if (user) {
      // Step 3: User exists with email but no SSO binding - require linking flow
      this.logger.log(`Found user with email ${email} but no SSO binding. Account linking required.`);
      const error = new AccountLinkingRequiredException({
        email,
        externalId: oidcUserId,
        providerId: this.config.ssoProviderId,
        providerType: SSOProviderType.OIDC,
      });
      throw error;
    }

    // Step 4: No user exists, create new user with external ID
    const defaultUsernamePaths = ['preferred_username', 'email', 'sub'];
    const usernamePaths =
      this.config.usernameClaimPaths && this.config.usernameClaimPaths.length > 0
        ? this.config.usernameClaimPaths
        : defaultUsernamePaths;
    const resolvedUsername = this.firstNonEmptyStringFromPaths(usernamePaths, claimSources);
    const rawUsername = resolvedUsername || profile.username || email;
    const username = usersService.buildUsernameFromSSOClaim(rawUsername, email);
    this.logger.log(`Creating new user with external ID: ${oidcUserId}`);
    user = await usersService.createOne({
      username,
      email,
      externalIdentifier: null,
      isEmailVerified: true,
    });

    if (!user) {
      this.logger.error('Failed to create user after SSO authentication');
      const error = new UnauthorizedException();
      this.recordFailure(error);
      throw error;
    }

    // The user row is durable now, even if adding its SSO binding subsequently fails.
    await this.recordProvisioningAudit(user.id, true);

    await authService.addAuthenticationDetails(user.id, {
      type: AuthenticationType.SSO,
      details: {
        providerId: this.config.ssoProviderId,
        providerType: SSOProviderType.OIDC,
        subject: oidcUserId,
      },
    });

    this.logger.log(`New user (ID: ${user.id}) created successfully with SSO subject: ${oidcUserId}`);
    return await this.syncPermissionsFromClaims(user, claimSources);
  }
}

export { SSO_OIDC_CALLBACK_URL_REQUEST_KEY, SSO_OIDC_STATE_REQUEST_KEY } from './oidc.strategy.route-context';

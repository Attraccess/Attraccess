import { Profile, Strategy } from 'passport-openidconnect';
import { get } from 'lodash-es';
import { PassportStrategy } from '@nestjs/passport';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  AuthenticationType,
  SSOProviderOIDCConfiguration,
  SSOProviderType,
  User,
} from '@attraccess/database-entities';
import { UsersService } from '../../../users/users.service';
import { ModuleRef } from '@nestjs/core';
import { AccountLinkingRequiredException } from './exceptions/account-linking-required.exception';
import { AuthService } from '../../auth.service';
import { normalizePermissionToken, resolveRoleKeysFromSsoRoles } from '../permission-mapping';
import { RbacService } from '../../../rbac/rbac.service';
import { OidcCookieStateStore, OIDCAppState } from './oidc-cookie-state-store';
import { MetricsService } from '../../../../metrics/metrics.service';
import { classifySsoFailureReason, markSsoFailureMetricRecorded, recordSsoLoginFailure } from '../sso-metrics';

/** Request key set by SSOOIDCGuard so the strategy uses the per-request callback URL (current settings, no restart needed). */
export const SSO_OIDC_CALLBACK_URL_REQUEST_KEY = '_ssoOidcCallbackUrl';

/** Request key set by SSOOIDCGuard for login route: state to pass to OIDC (e.g. { redirectTo }). */
export const SSO_OIDC_STATE_REQUEST_KEY = '_ssoOidcState';

@Injectable()
export class SSOOIDCStrategy extends PassportStrategy(Strategy, 'sso-oidc', true) {
  private readonly logger = new Logger(SSOOIDCStrategy.name);
  private readonly config: SSOProviderOIDCConfiguration;

  constructor(
    private moduleRef: ModuleRef,
    config: SSOProviderOIDCConfiguration,
    callbackURL: string,
    stateStore: OidcCookieStateStore,
  ) {
    const configuredScopes =
      config.scopes && config.scopes.length > 0 ? config.scopes : ['openid', 'email', 'profile'];
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
  authenticate(req: Parameters<InstanceType<typeof Strategy>['authenticate']>[0], options?: Parameters<InstanceType<typeof Strategy>['authenticate']>[1]): void {
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

  private isOIDCAppState(value: unknown): value is OIDCAppState {
    return (
      value !== null &&
      typeof value === 'object' &&
      (!('redirectTo' in value) || typeof (value as OIDCAppState).redirectTo === 'string')
    );
  }

  private firstNonEmptyStringFromPaths(paths: string[], sources: unknown[]): string | undefined {
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

  private recordFailure(error: unknown): void {
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

  private parseIdTokenClaims(idToken?: string): Record<string, unknown> | undefined {
    if (!idToken) {
      return undefined;
    }

    const parts = idToken.split('.');
    if (parts.length < 2) {
      this.logger.warn('OIDC id_token format invalid; skipping claim extraction');
      return undefined;
    }

    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const payload = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(payload) as Record<string, unknown>;
    } catch (error) {
      this.logger.warn(`Failed to parse id_token claims: ${String(error)}`);
      return undefined;
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
      return await this.syncPermissionsFromClaims(user, claimSources, usersService);
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

    await authService.addAuthenticationDetails(user.id, {
      type: AuthenticationType.SSO,
      details: {
        providerId: this.config.ssoProviderId,
        providerType: SSOProviderType.OIDC,
        subject: oidcUserId,
      },
    });

    this.logger.log(`New user (ID: ${user.id}) created successfully with SSO subject: ${oidcUserId}`);
    return await this.syncPermissionsFromClaims(user, claimSources, usersService);
  }

  private getPermissionClaimValues(claimSources: unknown[]): unknown[] {
    const paths = ['permissions', 'roles', 'groups', 'realm_access.roles'];
    if (this.config.clientId) {
      paths.push(`resource_access.${this.config.clientId}.roles`);
    }

    const values: unknown[] = [];
    for (const path of paths) {
      for (const source of claimSources) {
        const value = get(source, path);
        if (value !== undefined && value !== null) {
          values.push(value);
        }
      }
    }

    return values;
  }

  private resolveRoleNamesFromClaims(claimSources: unknown[]): string[] {
    const roleNames: string[] = [];
    const claimValues = this.getPermissionClaimValues(claimSources);
    this.logger.debug(`Permission claim values: ${JSON.stringify(claimValues)}`);

    for (const value of claimValues) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') roleNames.push(entry);
        }
        continue;
      }
      if (typeof value === 'string') {
        roleNames.push(value);
        continue;
      }
      if (value && typeof value === 'object') {
        for (const entry of Object.values(value)) {
          if (typeof entry === 'string') roleNames.push(entry);
          else if (Array.isArray(entry)) {
            for (const item of entry) {
              if (typeof item === 'string') roleNames.push(item);
            }
          }
        }
      }
    }

    this.logger.debug(`Resolved SSO role names: ${JSON.stringify(roleNames)}`);
    return roleNames;
  }

  private async syncPermissionsFromClaims(
    user: User,
    claimSources: unknown[],
    _usersService: UsersService,
  ): Promise<User> {
    const roleNames = this.resolveRoleNamesFromClaims(claimSources);
    const roleKeys = resolveRoleKeysFromSsoRoles(roleNames, this.config.permissionMappings);
    this.logger.debug(`RBAC role keys from SSO: ${JSON.stringify([...roleKeys])}`);

    const rbacService = this.moduleRef.get(RbacService, { strict: false });
    if (rbacService) {
      await rbacService.syncSsoRoles(
        user.id,
        [...roleKeys],
        SSOProviderType.OIDC,
        this.config.ssoProviderId,
      );
    }
    return user;
  }
}

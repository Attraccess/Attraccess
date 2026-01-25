import { Profile, Strategy } from 'passport-openidconnect';
import { get } from 'lodash-es';
import { PassportStrategy } from '@nestjs/passport';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  AuthenticationType,
  SSOProviderOIDCConfiguration,
  SSOProviderType,
  SystemPermissions,
  User,
} from '@attraccess/database-entities';
import { UsersService } from '../../../users/users.service';
import { ModuleRef } from '@nestjs/core';
import { AccountLinkingRequiredException } from './exceptions/account-linking-required.exception';
import { AuthService } from '../../auth.service';
import {
  DEFAULT_PERMISSION_KEY_MAP,
  normalizePermissionToken,
  resolvePermissionsFromRoles,
} from '../permission-mapping';

@Injectable()
export class SSOOIDCStrategy extends PassportStrategy(Strategy, 'sso-oidc') {
  private readonly logger = new Logger(SSOOIDCStrategy.name);
  private readonly config: SSOProviderOIDCConfiguration;

  constructor(
    private moduleRef: ModuleRef,
    config: SSOProviderOIDCConfiguration,
    callbackURL: string,
  ) {
    super({
      issuer: config.issuer,
      authorizationURL: config.authorizationURL,
      userInfoURL: config.userInfoURL,
      tokenURL: config.tokenURL,
      clientID: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL,
      scope: config.scopes && config.scopes.length > 0 ? config.scopes : ['openid', 'email', 'profile'],
    });

    this.logger.log(`Initialized OIDC strategy with issuer: ${config.issuer} and callbackURL: ${callbackURL}`);
    this.config = config;
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

  async validate(_issuer: string, profile: Profile): Promise<User> {
    this.logger.log(`Validating OIDC profile for issuer: ${_issuer}`);

    const oidcUserId = profile.id;

    if (!oidcUserId) {
      this.logger.error('No user ID found in SSO profile');
      throw new BadRequestException('No user ID found in SSO profile');
    }

    const usersService = await this.moduleRef.get(UsersService, { strict: false });
    const authService = await this.moduleRef.get(AuthService, { strict: false });

    // Build candidate sources to resolve claims from
    const claimSources: unknown[] = [profile];
    const raw = profile && '_json' in profile && profile._json ? profile._json : undefined;
    if (raw) claimSources.push(raw);

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
      throw new BadRequestException('No email found in SSO profile');
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
      throw new AccountLinkingRequiredException({
        email,
        externalId: oidcUserId,
        providerId: this.config.ssoProviderId,
        providerType: SSOProviderType.OIDC,
      });
    }

    // Step 4: No user exists, create new user with external ID
    const defaultUsernamePaths = ['preferred_username', 'email', 'sub'];
    const usernamePaths =
      this.config.usernameClaimPaths && this.config.usernameClaimPaths.length > 0
        ? this.config.usernameClaimPaths
        : defaultUsernamePaths;
    const resolvedUsername = this.firstNonEmptyStringFromPaths(usernamePaths, claimSources);
    const username = resolvedUsername || profile.username || email;
    this.logger.log(`Creating new user with external ID: ${oidcUserId}`);
    user = await usersService.createOne({
      username,
      email,
      externalIdentifier: null,
      isEmailVerified: true,
      skipUsernameSanitization: true,
    });

    if (!user) {
      this.logger.error('Failed to create user after SSO authentication');
      throw new UnauthorizedException();
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
    const paths = ['systemPermissions', 'permissions', 'roles', 'groups', 'realm_access.roles'];
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

  private resolvePermissionUpdates(claimSources: unknown[]): Partial<SystemPermissions> {
    const directUpdates: Partial<SystemPermissions> = {};
    const roleNames: string[] = [];

    for (const value of this.getPermissionClaimValues(claimSources)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') {
            roleNames.push(entry);
          }
        }
        continue;
      }

      if (typeof value === 'string') {
        roleNames.push(value);
        continue;
      }

      if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
          const normalizedKey = normalizePermissionToken(key);
          const permissionKey = DEFAULT_PERMISSION_KEY_MAP[normalizedKey];
          if (permissionKey && typeof entry === 'boolean') {
            directUpdates[permissionKey] = entry;
            continue;
          }

          if (Array.isArray(entry)) {
            for (const item of entry) {
              if (typeof item === 'string') {
                roleNames.push(item);
              }
            }
            continue;
          }

          if (typeof entry === 'string') {
            roleNames.push(entry);
          }
        }
      }
    }

    const roleBasedUpdates = resolvePermissionsFromRoles(roleNames, this.config.permissionMappings);
    return {
      ...roleBasedUpdates,
      ...directUpdates,
    };
  }

  private buildDefaultPermissions(): SystemPermissions {
    return {
      canManageResources: false,
      canManageSystemConfiguration: false,
      canManageUsers: false,
      canManageBilling: false,
    };
  }

  private async syncPermissionsFromClaims(
    user: User,
    claimSources: unknown[],
    usersService: UsersService,
  ): Promise<User> {
    const updates = this.resolvePermissionUpdates(claimSources);
    if (Object.keys(updates).length === 0) {
      return user;
    }

    const current = user.systemPermissions ?? this.buildDefaultPermissions();
    const merged = { ...current, ...updates };
    const shouldUpdate = Object.keys(updates).some(
      (key) => merged[key as keyof SystemPermissions] !== current[key as keyof SystemPermissions],
    );
    if (!shouldUpdate) {
      return user;
    }

    this.logger.debug(`Updating permissions for user ${user.id} from SSO claims`);
    return await usersService.updateOne(user.id, { systemPermissions: merged });
  }
}

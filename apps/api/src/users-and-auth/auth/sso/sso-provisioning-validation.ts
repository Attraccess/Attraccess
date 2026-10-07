import { AuthenticationType, SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from './dto/sso-provisioning.dto';
import { InvalidSSOProviderIdException, SSOProviderNotFoundException } from './errors';
import { resolveSsoRoleAssignments } from './permission-mapping';
import { SsoLoginRoutesImplementation } from './sso-login.routes';
export abstract class SsoProvisioningValidationImplementation extends SsoLoginRoutesImplementation {
  protected parseProviderId(rawProviderId: string): number {
    const providerId = parseInt(rawProviderId, 10);
    if (Number.isNaN(providerId)) {
      throw new InvalidSSOProviderIdException();
    }
    return providerId;
  }

  protected extractProvisioningToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.substring(7).trim();
    }

    const apiKeyHeader = request.headers['x-api-key'];
    if (Array.isArray(apiKeyHeader)) {
      return apiKeyHeader.length > 0 ? apiKeyHeader[0].trim() : null;
    }
    if (typeof apiKeyHeader === 'string') {
      return apiKeyHeader.trim();
    }

    return null;
  }

  protected assertProvisioningAuthorized(provider: SSOProvider, request: Request): void {
    const secret =
      provider.type === SSOProviderType.SAML
        ? provider.samlConfiguration?.provisioningSecret
        : provider.oidcConfiguration?.clientSecret;
    if (!secret) {
      throw new UnauthorizedException('SSO_CLIENT_SECRET_NOT_CONFIGURED');
    }

    const provided = this.extractProvisioningToken(request);
    if (!provided) {
      throw new UnauthorizedException('SSO_PROVISIONING_TOKEN_REQUIRED');
    }

    const expectedBuffer = Buffer.from(secret);
    const actualBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
      throw new UnauthorizedException('SSO_PROVISIONING_UNAUTHORIZED');
    }
  }

  protected async loadProvisioningProvider(type: SSOProviderType, providerId: number): Promise<SSOProvider> {
    const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(type, providerId);
    if (!provider) {
      throw new SSOProviderNotFoundException();
    }

    if (type === SSOProviderType.OIDC && !provider.oidcConfiguration) {
      throw new SSOProviderNotFoundException();
    }
    if (type === SSOProviderType.SAML && !provider.samlConfiguration) {
      throw new SSOProviderNotFoundException();
    }

    return provider;
  }

  protected async resolveProvisioningUser(
    providerType: SSOProviderType,
    providerId: number,
    payload: SSOProvisioningUserDto,
  ) {
    const subject = payload.subject?.trim();
    const email = payload.email?.trim();

    if (!subject && !email) {
      throw new BadRequestException('SSO_SUBJECT_OR_EMAIL_REQUIRED');
    }

    let user =
      subject && providerType === SSOProviderType.SAML
        ? await this.usersService.findOne({ externalIdentifier: subject })
        : subject
          ? await this.usersService.findOneBySSO(providerType, providerId, subject)
          : null;

    if (!user && email) {
      user = await this.usersService.findOne({ email }, ['authenticationDetails']);
      if (user) {
        if (providerType === SSOProviderType.SAML) {
          if (!user.externalIdentifier) {
            user = null;
          }
        } else {
          const isMatchingProvider = user.authenticationDetails?.some(
            (detail) =>
              detail.type === AuthenticationType.SSO &&
              detail.providerType === providerType &&
              detail.providerId === providerId,
          );
          if (!isMatchingProvider) {
            user = null;
          }
        }
      }
    }

    if (!user) {
      throw new NotFoundException('SSO_USER_NOT_FOUND');
    }

    return user;
  }

  // Per-role ceiling: each mapped role must have permissions that are a subset of the actor's own
  protected async assertPermissionMappingCeiling(
    mappings: Array<Record<string, string[]> | undefined>,
    actorPermissions: Set<string>,
  ): Promise<void> {
    const roleKeys = new Set(mappings.flatMap((m) => Object.keys(m ?? {})));
    if (roleKeys.size === 0) return;

    const allRoles = await this.rbacService.getRoles();
    const roleByKey = new Map(allRoles.map((r) => [r.key, r]));

    for (const roleKey of roleKeys) {
      const role = roleByKey.get(roleKey);
      if (!role) {
        throw new ForbiddenException(`Cannot map unknown role '${roleKey}'`);
      }
      const missing = role.rolePermissions.map((rp) => rp.permissionKey).filter((k) => !actorPermissions.has(k));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Cannot map role '${roleKey}': it grants permissions you do not hold (${missing.join(', ')})`,
        );
      }
    }
  }

  protected async applyProvisioningPermissions(
    userId: number,
    provider: SSOProvider,
    payload: SSOProvisioningPermissionsDto,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] } | undefined> {
    const mapping =
      provider.type === SSOProviderType.OIDC
        ? provider.oidcConfiguration?.roleMappings
        : provider.samlConfiguration?.roleMappings;

    // If the payload contains no `roles` field at all, treat as "no permission info" and skip
    // sync to avoid wiping SSO-granted roles on incremental provisioning calls.
    if (payload.roles === undefined) return undefined;

    const roleNames = payload.roles.map((r) => r.trim()).filter((r) => r.length > 0);
    const roleAssignments = resolveSsoRoleAssignments(roleNames, mapping);

    return this.rbacService.syncSsoRoles(userId, roleAssignments, provider.type, provider.id);
  }
}

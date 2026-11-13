import { AuthenticationType, SSOProvider, SSOProviderType, User } from '@attraccess/database-entities';

import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { timingSafeEqual } from 'crypto';

import { RbacService } from '../../../rbac/rbac.service';

import { AuthAuditLogger } from '../../../rate-limiting/auth-audit.logger';

import { BruteForceProtectionService } from '../../../rate-limiting/brute-force.service';

import { UsersService } from '../../../users/users.service';

import { SessionService } from '../../session.service';

import { SsoChangeAuditService } from '../audit/sso-change-audit.service';

import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from '../dto/sso-provisioning.dto';

import { SSOProviderNotFoundException } from '../errors';

import { resolveSsoRoleAssignments } from '../permission-mapping';

import { SSOService } from '../sso.service';

/** The provider a provisioning call was addressed to, as named by its route. */
export interface SsoProvisioningTarget {
  type: SSOProviderType;
  providerId: number;
  provider: SSOProvider;
}

/** What identity providers provision through their shared secret: logouts, deletions and role syncs. */
@Injectable()
export class SsoProvisioningService {
  constructor(
    private readonly ssoService: SSOService,
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
    private readonly rbacService: RbacService,
    private readonly bruteForce: BruteForceProtectionService,
    private readonly authAudit: AuthAuditLogger,
    private readonly changeAudit: SsoChangeAuditService,
  ) {}

  async loadProvider(type: SSOProviderType, providerId: number): Promise<SSOProvider> {
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

  /** Only a failed secret check counts against the IP and provider, never what the call does afterwards. */
  async verifySecret(provider: SSOProvider, ip: string, username: string, provided: string | null): Promise<void> {
    try {
      this.compareSecret(provider, provided);
    } catch (error) {
      await this.bruteForce.recordFailure('sso_provisioning', ip, null, username);
      await this.authAudit.log({
        type: 'sso_provisioning',
        outcome: 'invalid_credentials',
        ip,
        username,
        reason: error instanceof Error ? error.message : undefined,
      });
      throw error;
    }
    await this.bruteForce.recordSuccess('sso_provisioning', ip, null, username);
  }

  async revokeSessions(target: SsoProvisioningTarget, payload: SSOProvisioningUserDto): Promise<void> {
    const user = await this.resolveUser(target, payload);
    await this.sessionService.revokeAllUserSessions(user.id);
    await this.changeAudit.recordProvisioning('sessions_revoked', target.provider, user.id, { sessionsRevoked: true });
  }

  async deleteUser(target: SsoProvisioningTarget, payload: SSOProvisioningUserDto): Promise<void> {
    const user = await this.resolveUser(target, payload);
    await this.usersService.deleteOne(user.id);
    await this.changeAudit.recordProvisioning('user_deleted', target.provider, user.id, { userDeleted: true });
  }

  async updatePermissions(target: SsoProvisioningTarget, payload: SSOProvisioningPermissionsDto): Promise<void> {
    const user = await this.resolveUser(target, payload);
    const changes = await this.applyPermissions(user.id, target.provider, payload);
    if (changes) await this.changeAudit.recordProvisioning('permissions_synced', target.provider, user.id, changes);
  }

  private compareSecret(provider: SSOProvider, provided: string | null): void {
    const secret =
      provider.type === SSOProviderType.SAML
        ? provider.samlConfiguration?.provisioningSecret
        : provider.oidcConfiguration?.clientSecret;
    if (!secret) {
      throw new UnauthorizedException('SSO_CLIENT_SECRET_NOT_CONFIGURED');
    }

    if (!provided) {
      throw new UnauthorizedException('SSO_PROVISIONING_TOKEN_REQUIRED');
    }

    const expectedBuffer = Buffer.from(secret);
    const actualBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
      throw new UnauthorizedException('SSO_PROVISIONING_UNAUTHORIZED');
    }
  }

  private async resolveUser(
    { type: providerType, providerId }: SsoProvisioningTarget,
    payload: SSOProvisioningUserDto,
  ): Promise<User> {
    const subject = payload.subject?.trim();
    const email = payload.email?.trim();

    if (!subject && !email) {
      throw new BadRequestException('SSO_SUBJECT_OR_EMAIL_REQUIRED');
    }

    let user = subject ? await this.usersService.findOneBySSO(providerType, providerId, subject) : null;

    if (!user && email) {
      user = await this.usersService.findOne({ email }, ['authenticationDetails']);
      const isMatchingProvider = user?.authenticationDetails?.some(
        (detail) =>
          detail.type === AuthenticationType.SSO &&
          detail.providerType === providerType &&
          detail.providerId === providerId,
      );
      if (!isMatchingProvider) {
        user = null;
      }
    }

    if (!user) {
      throw new NotFoundException('SSO_USER_NOT_FOUND');
    }

    return user;
  }

  private async applyPermissions(
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

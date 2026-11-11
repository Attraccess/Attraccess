import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { AUDIT_RECORDER, AuditRecorder } from '../../../../audit/recorder/audit-event';
import { AuthAuditLogger } from '../../../rate-limiting/auth-audit.logger';
import { BruteForceProtectionService } from '../../../rate-limiting/brute-force.service';
import { RbacService } from '../../../rbac/rbac.service';
import { UsersService } from '../../../users/users.service';
import { SessionService } from '../../session.service';
import { recordSsoProvisioningAudit } from '../audit/provider-audit';
import { SSOProvisioningPermissionsDto } from '../dto/sso-provisioning.dto';
import { resolveSsoRoleAssignments } from '../permission-mapping';

/**
 * Changes an identity provider makes through the provisioning endpoints (user deletion, logout, role sync),
 * authorized by the provider's provisioning secret. Each change is audited as `sso.provisioning.*`.
 */
@Injectable()
export class SsoProvisioningService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
    private readonly rbacService: RbacService,
    private readonly bruteForce: BruteForceProtectionService,
    private readonly authAudit: AuthAuditLogger,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /** Throttled per IP and provider; call before `verifySecret`. */
  async assertIpAllowed(provider: SSOProvider, ip: string): Promise<void> {
    const username = provisioningUsername(provider);
    try {
      await this.bruteForce.assertIpAllowed('sso_provisioning', ip, username);
    } catch (error) {
      await this.authAudit.log({
        type: 'sso_provisioning',
        outcome: 'rate_limited',
        ip,
        username,
        reason: 'ip_throttled',
      });
      throw error;
    }
  }

  /** Only a failed secret check counts against the IP, never what the call does afterwards. */
  async verifySecret(provider: SSOProvider, ip: string, presentedSecret: string | null): Promise<void> {
    const username = provisioningUsername(provider);
    try {
      verifyProvisioningSecret(provider, presentedSecret);
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

  async deleteUser(provider: SSOProvider, userId: number): Promise<void> {
    await this.usersService.deleteOne(userId);
    await recordSsoProvisioningAudit(this.audit, 'user_deleted', userId, provider, { userDeleted: true });
  }

  async revokeSessions(provider: SSOProvider, userId: number): Promise<void> {
    await this.sessionService.revokeAllUserSessions(userId);
    await recordSsoProvisioningAudit(this.audit, 'sessions_revoked', userId, provider, { sessionsRevoked: true });
  }

  /**
   * Syncs the provider-granted roles to the roles the payload names. A payload without a `roles` field carries
   * no permission information and leaves the SSO-granted roles alone (incremental provisioning calls).
   */
  async syncPermissions(provider: SSOProvider, userId: number, payload: SSOProvisioningPermissionsDto): Promise<void> {
    if (payload.roles === undefined) return;
    const mapping =
      provider.type === SSOProviderType.OIDC
        ? provider.oidcConfiguration?.roleMappings
        : provider.samlConfiguration?.roleMappings;
    const roleNames = payload.roles.map((r) => r.trim()).filter((r) => r.length > 0);
    const roleAssignments = resolveSsoRoleAssignments(roleNames, mapping);
    const changes = await this.rbacService.syncSsoRoles(userId, roleAssignments, provider.type, provider.id);
    if (changes) await recordSsoProvisioningAudit(this.audit, 'permissions_synced', userId, provider, changes);
  }
}

const provisioningUsername = (provider: SSOProvider) => `provider:${provider.type}:${provider.id}`;

function verifyProvisioningSecret(provider: SSOProvider, provided: string | null): void {
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

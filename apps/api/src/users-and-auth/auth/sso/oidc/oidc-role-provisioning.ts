import { SSOProviderType, User } from '@attraccess/database-entities';
import { randomUUID } from 'node:crypto';
import { SsoAuditService } from '../../../../audit/sso-audit.service';
import { RbacService } from '../../../rbac/rbac.service';
import { resolveSsoRoleAssignments } from '../permission-mapping';
import { ssoAuditSnapshot } from '../sso-audit-snapshot';
import { SSOService } from '../sso.service';
import { OidcClaimMappingImplementation } from './oidc-claim-mapping';
export abstract class OidcRoleProvisioningImplementation extends OidcClaimMappingImplementation {
  protected async syncPermissionsFromClaims(user: User, claimSources: unknown[], userCreated = false): Promise<User> {
    const claimValues = this.getPermissionClaimValues(claimSources);
    this.logger.debug(`Permission claim values: ${JSON.stringify(claimValues)}`);
    const roleNames = this.resolveRoleNamesFromClaims(claimValues);
    const roleAssignments = resolveSsoRoleAssignments(roleNames, this.config.roleMappings);
    this.logger.debug(`RBAC role keys from SSO: ${JSON.stringify(roleAssignments.map((r) => r.roleKey))}`);

    const rbacService = this.moduleRef.get(RbacService, { strict: false });
    let changes: { added: string[]; removed: string[]; updated: string[] } | undefined;
    if (!rbacService) {
      this.logger.warn('RbacService not available via ModuleRef — SSO role sync skipped; existing roles preserved');
    } else if (claimValues.length > 0) {
      // Only sync when the token contained at least one role/group claim key. A present-but-empty
      // claim (e.g. groups: []) is authoritative and revokes this provider's SSO-managed roles; a
      // wholly absent claim (missing scope, transient IdP omission) must not silently revoke
      // anything. Intentionally not gated on a configured mapping: a cleared mapping must still
      // sync (with zero assignments) so roles granted under the old mapping get revoked.
      changes = await rbacService.syncSsoRoles(
        user.id,
        roleAssignments,
        SSOProviderType.OIDC,
        this.config.ssoProviderId,
      );
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
      const details = { provider: ssoAuditSnapshot(provider) };
      if (userCreated) {
        await audit.record({
          action: 'sso.provisioning.user_created',
          operationId: randomUUID(),
          actorId: null,
          authenticationMethod: null,
          subject: { type: 'user', id: userId },
          details: { ...details, changes: JSON.stringify({ userCreated: true }) },
        });
      }
      if (changes) {
        await audit.record({
          action: 'sso.provisioning.permissions_synced',
          operationId: randomUUID(),
          actorId: null,
          authenticationMethod: null,
          subject: { type: 'user', id: userId },
          details: { ...details, changes: JSON.stringify(changes) },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to record committed OIDC provisioning audit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

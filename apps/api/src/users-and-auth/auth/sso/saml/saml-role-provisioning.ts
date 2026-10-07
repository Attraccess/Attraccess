import { SSOProviderSAMLConfiguration, SSOProviderType, User } from '@attraccess/database-entities';
import { Profile as SamlProfile } from '@node-saml/passport-saml';
import { randomUUID } from 'node:crypto';
import { SsoAuditService } from '../../../../audit/sso-audit.service';
import { RbacService } from '../../../rbac/rbac.service';
import { resolveSsoRoleAssignments } from '../permission-mapping';
import { ssoAuditSnapshot } from '../sso-audit-snapshot';
import { SSOService } from '../sso.service';
import { SamlProviderConfigurationImplementation } from './saml-provider-configuration';
export abstract class SamlRoleProvisioningImplementation extends SamlProviderConfigurationImplementation {
  protected getPermissionClaimValues(profile: SamlProfile): unknown[] {
    const values: unknown[] = [];
    const profileRecord = profile as Record<string, unknown>;
    const candidateKeys = [
      'roles',
      'role',
      'groups',
      'group',
      'memberof',
      // Azure AD / ADFS URI-style claim names
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
      'http://schemas.xmlsoap.org/claims/group',
    ];

    // Check candidateKeys inside the SAML attributes bag (not all attributes — that would
    // include email/displayName and make the empty-claims guard always true)
    const attributes = profileRecord.attributes;
    if (attributes && typeof attributes === 'object') {
      for (const [attrKey, attrVal] of Object.entries(attributes as Record<string, unknown>)) {
        if (candidateKeys.includes(attrKey.toLowerCase()) && attrVal !== undefined && attrVal !== null) {
          values.push(attrVal);
        }
      }
    }

    // Also check candidateKeys at the top level of the profile
    for (const [profileKey, profileVal] of Object.entries(profileRecord)) {
      if (candidateKeys.includes(profileKey.toLowerCase()) && profileVal !== undefined && profileVal !== null) {
        values.push(profileVal);
      }
    }

    return values;
  }

  protected resolveRoleNamesFromClaims(claimValues: unknown[]): string[] {
    const roleNames: string[] = [];
    for (const value of claimValues) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') roleNames.push(entry);
        }
      } else if (typeof value === 'string') {
        roleNames.push(value);
      }
    }
    return roleNames;
  }

  protected async syncPermissionsFromClaims(
    user: User,
    profile: SamlProfile,
    config: SSOProviderSAMLConfiguration,
  ): Promise<User> {
    const claimValues = this.getPermissionClaimValues(profile);
    const roleNames = this.resolveRoleNamesFromClaims(claimValues);
    const roleAssignments = resolveSsoRoleAssignments(roleNames, config.roleMappings);
    this.logger.debug(`RBAC role keys from SAML: ${JSON.stringify(roleAssignments.map((r) => r.roleKey))}`);

    const rbacService = this.moduleRef.get(RbacService, { strict: false });
    if (!rbacService) {
      this.logger.warn('RbacService not available via ModuleRef — SSO role sync skipped; existing roles preserved');
    }
    // Only sync when the assertion contained at least one role/group attribute key. A
    // present-but-empty attribute is authoritative and revokes this provider's SSO-managed roles;
    // a wholly absent attribute (IdP misconfiguration, transient omission) must not silently
    // revoke anything. Intentionally not gated on a configured mapping: a cleared mapping must
    // still sync (with zero assignments) so roles granted under the old mapping get revoked.
    let changes: { added: string[]; removed: string[]; updated: string[] } | undefined;
    if (rbacService && claimValues.length > 0) {
      changes = await rbacService.syncSsoRoles(user.id, roleAssignments, SSOProviderType.SAML, config.ssoProviderId);
    }
    if (changes) await this.recordProvisioningAudit(user.id, config.ssoProviderId, 'permissions_synced', changes);
    return user;
  }

  protected async recordProvisioningAudit(
    userId: number,
    providerId: number,
    action: 'user_created' | 'permissions_synced',
    changes?: { added: string[]; removed: string[]; updated: string[] },
  ): Promise<void> {
    try {
      const ssoService = this.moduleRef.get(SSOService, { strict: false });
      const audit = this.moduleRef.get(SsoAuditService, { strict: false });
      const provider = await ssoService?.getProviderByTypeAndIdWithConfiguration(SSOProviderType.SAML, providerId);
      if (!audit || !provider) return;
      const details = { provider: ssoAuditSnapshot(provider) };
      await audit.record({
        action: `sso.provisioning.${action}`,
        operationId: randomUUID(),
        actorId: null,
        authenticationMethod: null,
        subject: { type: 'user', id: userId },
        details: { ...details, changes: JSON.stringify(action === 'user_created' ? { userCreated: true } : changes) },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record committed SAML provisioning audit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

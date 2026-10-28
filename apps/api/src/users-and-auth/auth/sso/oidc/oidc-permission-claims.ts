import { Logger } from '@nestjs/common';
import { SSOProviderOIDCConfiguration, SSOProviderType } from '@attraccess/database-entities';
import { get } from 'lodash-es';
import type { RbacService } from '../../../rbac/rbac.service';
import { resolveSsoRoleAssignments } from '../permission-mapping';
import type { RoleDelta } from '../session-permission-sync';

const logger = new Logger('OidcPermissionClaims');

/** Claim values that may carry IdP roles/groups; shared by login and session-time re-sync. */
export function getOidcPermissionClaimValues(claimSources: unknown[], clientId?: string | null): unknown[] {
  const paths = ['permissions', 'roles', 'groups', 'realm_access.roles'];
  if (clientId) {
    paths.push(`resource_access.${clientId}.roles`);
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

export function resolveOidcRoleNames(claimValues: unknown[]): string[] {
  const roleNames: string[] = [];

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

  return roleNames;
}

/**
 * Login and session-time re-sync share this pipeline: claims → role names → mapped assignments →
 * `syncSsoRoles`. Returns the role delta, or undefined when no role/group claim key was present.
 *
 * Only syncs when the claims contained at least one role/group claim key. A present-but-empty
 * claim (e.g. groups: []) is authoritative and revokes this provider's SSO-managed roles; a
 * wholly absent claim (missing scope, transient IdP omission) must not silently revoke
 * anything. Intentionally not gated on a configured mapping: a cleared mapping must still
 * sync (with zero assignments) so roles granted under the old mapping get revoked.
 */
export async function syncOidcRolesFromClaims(
  rbacService: Pick<RbacService, 'syncSsoRoles'>,
  userId: number,
  config: Pick<SSOProviderOIDCConfiguration, 'ssoProviderId' | 'clientId' | 'roleMappings'>,
  claimSources: unknown[],
): Promise<RoleDelta | undefined> {
  const claimValues = getOidcPermissionClaimValues(claimSources, config.clientId);
  logger.debug(`Permission claim values: ${JSON.stringify(claimValues)}`);
  if (claimValues.length === 0) {
    logger.debug(`No role/group claims for user ${userId}; roles kept`);
    return undefined;
  }

  const roleNames = resolveOidcRoleNames(claimValues);
  logger.debug(`Resolved SSO role names: ${JSON.stringify(roleNames)}`);
  const roleAssignments = resolveSsoRoleAssignments(roleNames, config.roleMappings);
  logger.debug(`RBAC role keys from SSO: ${JSON.stringify(roleAssignments.map((r) => r.roleKey))}`);
  return rbacService.syncSsoRoles(userId, roleAssignments, SSOProviderType.OIDC, config.ssoProviderId);
}

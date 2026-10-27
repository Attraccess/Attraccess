import { get } from 'lodash-es';

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

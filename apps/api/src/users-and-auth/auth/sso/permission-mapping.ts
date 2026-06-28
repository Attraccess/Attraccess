import { hasConfiguredPermissionMapping as hasConfiguredPermissionMappingShared } from '@attraccess/shared';

export type SsoRoleMapping = Record<string, string[]>;

export const normalizePermissionToken = (token: string): string => {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Backward-compat fallback: IdP configurations that sent the old boolean permission names
// as SSO role strings (e.g. Okta attribute "roles" = ["canManageResources"]) still resolve
// to the corresponding RBAC role key when no explicit permissionMappings are configured.
const LEGACY_SSO_NAME_TO_ROLE_KEY: Record<string, string> = {
  canmanageresources: 'resource-manager',
  canmanagesystemconfiguration: 'system-admin',
  canmanageusers: 'user-manager',
  canmanagebilling: 'billing-manager',
};

export const hasConfiguredPermissionMapping = (
  mapping?: SsoRoleMapping | null,
): boolean => hasConfiguredPermissionMappingShared(mapping as Record<string, unknown> | null | undefined);

export const resolveRoleKeysFromSsoRoles = (
  roleNames: string[],
  mapping?: SsoRoleMapping | null,
): Set<string> => {
  const normalizedRoles = new Set(roleNames.map(normalizePermissionToken).filter((v) => v.length > 0));
  const result = new Set<string>();

  if (hasConfiguredPermissionMapping(mapping)) {
    for (const [roleKey, configuredRoles] of Object.entries(mapping ?? {})) {
      if ((configuredRoles ?? []).some((r) => normalizedRoles.has(normalizePermissionToken(r)))) {
        result.add(roleKey);
      }
    }
    return result;
  }

  // Default: map legacy SSO role names to RBAC role keys
  for (const role of normalizedRoles) {
    const rbacKey = LEGACY_SSO_NAME_TO_ROLE_KEY[role];
    if (rbacKey) result.add(rbacKey);
  }
  return result;
};

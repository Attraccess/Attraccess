import { SystemPermission, SystemPermissions } from '@attraccess/database-entities';

export type SSOPermissionMapping = Partial<Record<SystemPermission, string[]>>;

export const DEFAULT_PERMISSION_KEY_MAP: Record<string, SystemPermission> = {
  canmanageresources: 'canManageResources',
  canmanagesystemconfiguration: 'canManageSystemConfiguration',
  canmanageusers: 'canManageUsers',
  canmanagebilling: 'canManageBilling',
};

export const normalizePermissionToken = (token: string): string => {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const hasConfiguredPermissionMapping = (mapping?: SSOPermissionMapping | null): boolean => {
  if (!mapping) {
    return false;
  }

  return Object.values(mapping).some((value) => Array.isArray(value) && value.length > 0);
};

const normalizeRoleNames = (roleNames: string[]): Set<string> => {
  return new Set(roleNames.map(normalizePermissionToken).filter((value) => value.length > 0));
};

export const resolvePermissionsFromRoles = (
  roleNames: string[],
  mapping?: SSOPermissionMapping | null,
): Partial<SystemPermissions> => {
  const normalizedRoles = normalizeRoleNames(roleNames);
  const updates: Partial<SystemPermissions> = {};

  if (hasConfiguredPermissionMapping(mapping)) {
    (Object.keys(mapping ?? {}) as Array<keyof SystemPermissions>).forEach((permissionKey) => {
      const configuredRoles = mapping?.[permissionKey] ?? [];
      if (!configuredRoles || configuredRoles.length === 0) {
        return;
      }
      updates[permissionKey] = configuredRoles.some((role) => normalizedRoles.has(normalizePermissionToken(role)));
    });
    return updates;
  }

  normalizedRoles.forEach((role) => {
    const permissionKey = DEFAULT_PERMISSION_KEY_MAP[role];
    if (permissionKey) {
      updates[permissionKey] = true;
    }
  });

  return updates;
};

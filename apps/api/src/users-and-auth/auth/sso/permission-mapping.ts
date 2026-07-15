import { hasConfiguredPermissionMapping as hasConfiguredPermissionMappingShared } from '@attraccess/shared';

export type SsoRoleMapping = Record<string, string[]>;

export const normalizePermissionToken = (token: string): string => {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
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

  if (!hasConfiguredPermissionMapping(mapping)) {
    return result;
  }

  for (const [roleKey, configuredRoles] of Object.entries(mapping ?? {})) {
    if (!Array.isArray(configuredRoles)) continue;
    if (configuredRoles.some((r) => normalizedRoles.has(normalizePermissionToken(r)))) {
      result.add(roleKey);
    }
  }
  return result;
};

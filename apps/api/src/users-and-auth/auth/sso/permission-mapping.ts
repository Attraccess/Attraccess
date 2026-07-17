import { hasConfiguredPermissionMapping as hasConfiguredPermissionMappingShared } from '@attraccess/shared';

export type SsoRoleMapping = Record<string, string[]>;

/** One Attraccess role granted by SSO claims, with the external claim value that granted it. */
export interface ResolvedSsoRoleAssignment {
  roleKey: string;
  externalValue: string | null;
}

export const normalizePermissionToken = (token: string): string => {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const hasConfiguredPermissionMapping = (
  mapping?: SsoRoleMapping | null,
): boolean => hasConfiguredPermissionMappingShared(mapping as Record<string, unknown> | null | undefined);

export const resolveSsoRoleAssignments = (
  roleNames: string[],
  mapping?: SsoRoleMapping | null,
): ResolvedSsoRoleAssignment[] => {
  if (!hasConfiguredPermissionMapping(mapping)) {
    return [];
  }

  // normalized external claim value -> original spelling (first occurrence wins)
  const normalizedToOriginal = new Map<string, string>();
  for (const name of roleNames) {
    const normalized = normalizePermissionToken(name);
    if (normalized.length > 0 && !normalizedToOriginal.has(normalized)) {
      normalizedToOriginal.set(normalized, name);
    }
  }

  const result: ResolvedSsoRoleAssignment[] = [];
  for (const [roleKey, configuredRoles] of Object.entries(mapping ?? {})) {
    if (!Array.isArray(configuredRoles)) continue;
    const matched = configuredRoles.find((r) => normalizedToOriginal.has(normalizePermissionToken(r)));
    if (matched !== undefined) {
      result.push({
        roleKey,
        externalValue: normalizedToOriginal.get(normalizePermissionToken(matched)) ?? matched,
      });
    }
  }
  return result;
};

export const resolveRoleKeysFromSsoRoles = (
  roleNames: string[],
  mapping?: SsoRoleMapping | null,
): Set<string> => {
  return new Set(resolveSsoRoleAssignments(roleNames, mapping).map((assignment) => assignment.roleKey));
};

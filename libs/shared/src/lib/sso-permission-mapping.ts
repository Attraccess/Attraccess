/**
 * Shared utility to detect if an SSO provider has configured permission mappings.
 * Used by both API and frontend to avoid drift in "SSO-managed" determination.
 */
export const hasConfiguredPermissionMapping = (
  mapping?: Record<string, unknown> | null,
): boolean => {
  if (!mapping) {
    return false;
  }
  return Object.values(mapping).some((value) => Array.isArray(value) && value.length > 0);
};

/**
 * Returns the list of permission keys that have at least one SSO role mapped.
 * Used to determine which specific permissions are SSO-managed (vs. all-or-nothing).
 */
export const getSsoManagedPermissionKeys = (
  mapping?: Record<string, unknown> | null,
): string[] => {
  if (!mapping) {
    return [];
  }
  return Object.entries(mapping)
    .filter(([, value]) => Array.isArray(value) && (value as unknown[]).length > 0)
    .map(([key]) => key);
};

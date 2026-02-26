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

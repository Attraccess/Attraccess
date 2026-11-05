/**
 * Shared utility to detect if an SSO provider has configured permission mappings.
 * Used by both API and frontend to avoid drift in "SSO-managed" determination.
 */
export const hasConfiguredPermissionMapping = (mapping?: Record<string, unknown> | null): boolean => {
  if (!mapping) {
    return false;
  }
  return Object.values(mapping).some((value) => Array.isArray(value) && value.length > 0);
};

/**
 * Returns the list of permission keys that have at least one SSO role mapped.
 * Used to determine which specific permissions are SSO-managed (vs. all-or-nothing).
 */
export const getSsoManagedPermissionKeys = (mapping?: Record<string, unknown> | null): string[] => {
  if (!mapping) {
    return [];
  }
  return Object.entries(mapping)
    .filter(([, value]) => Array.isArray(value) && (value as unknown[]).length > 0)
    .map(([key]) => key);
};

/**
 * OIDC claim paths read for roles/groups when a provider has no `roleClaimPaths` configured.
 * `resource_access.<clientId>.roles` is appended at runtime when the provider has a client id.
 * Shared so the API and the form placeholder cannot drift.
 */
export const DEFAULT_OIDC_ROLE_CLAIM_PATHS: readonly string[] = [
  'permissions',
  'roles',
  'groups',
  'realm_access.roles',
];

/** SAML attribute keys (lowercase, matched case-insensitively) read when no `roleAttributeKeys` are configured. */
export const DEFAULT_SAML_ROLE_ATTRIBUTE_KEYS: readonly string[] = [
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

import type { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

/**
 * Resource and access managers (`resources.update`, `resources.access.manage`) see every machine and all activity,
 * whatever the visibility settings say. Shared by the machine list rule (ATT-843) and the activity rule (ATT-1149).
 */
export function isResourceManager(user: Pick<AuthenticatedUser, 'effectivePermissions'>): boolean {
  const permissions = user.effectivePermissions;
  return permissions?.has('resources.update') === true || permissions?.has('resources.access.manage') === true;
}

import type { SystemPermission } from '@attraccess/shared';

/**
 * Resolves a route's permission gate for an already-logged-in user.
 *
 * A single key means "hold this permission". An array means "hold ANY ONE of these": a gate is a
 * door, and a door demanding every listed key at once locks out precisely the operators who
 * legitimately hold one of them. `/settings` is the case in point — it fronts sections gated on
 * three different permissions, so the operator who only manages SSO still has to get in.
 *
 * An empty array therefore grants nothing, which is the honest reading of "no permission opens
 * this".
 *
 * Shared by the router (app.tsx) and the sidebar, which must agree: a nav entry the sidebar shows
 * but the router rejects is a link to a 403.
 */
export function hasRequiredPermissions(
  authRequired: string | string[],
  hasPermission: (permission: SystemPermission) => boolean,
): boolean {
  const requiredPermissions = (Array.isArray(authRequired) ? authRequired : [authRequired]) as SystemPermission[];

  return requiredPermissions.some((permission) => hasPermission(permission));
}

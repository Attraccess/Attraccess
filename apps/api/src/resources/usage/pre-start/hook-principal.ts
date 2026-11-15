import type { User } from '@attraccess/database-entities';
import type { AuthenticatedUser, PluginAccessPrincipal } from '@attraccess/plugins-backend-sdk';

/**
 * The hooks' view of the starter: a request's user keeps its permissions (narrowed to an API token's scope), a user
 * loaded for a reader or supervision start is the plain id (full RBAC). A copy, so a plugin cannot change the request.
 */
export function hookPrincipal(user: User | AuthenticatedUser): PluginAccessPrincipal {
  const scope = (user as Partial<AuthenticatedUser>).effectivePermissions;
  return scope ? { id: user.id, effectivePermissions: [...scope] } : user.id;
}

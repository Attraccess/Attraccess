/**
 * Canonical set of system permission keys — mirrors the RBAC seed migration.
 * Shared between the API (backend guards/decorators) and the frontend (useAuth hasPermission).
 */
export type SystemPermission =
  | 'resources.read'
  | 'resources.create'
  | 'resources.update'
  | 'resources.delete'
  | 'resources.access.manage'
  | 'resources.maintenance.manage'
  | 'resources.reports.export'
  | 'users.read'
  | 'users.create'
  | 'users.update'
  | 'users.delete'
  | 'users.roles.manage'
  | 'users.api-tokens.manage'
  | 'system.settings.manage'
  | 'system.sso.manage'
  | 'system.plugins.manage'
  | 'billing.read'
  | 'billing.manage';

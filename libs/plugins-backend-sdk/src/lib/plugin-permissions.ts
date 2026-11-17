import type { SystemPermission } from '@attraccess/shared';
import type { PluginLocalizedLabel } from './plugin-notifications';

/**
 * RBAC permission keys a plugin declares through `PluginBackendModule.permissions`. The host registers them in the
 * permission catalog at load time, so they appear in the role editor and the API-token picker, and the plugin
 * guards its routes with them like core keys (`@Auth(PERMISSIONS.keys['acme.widgets.read'])`).
 *
 * Not to be confused with the manifest `permissions` field, which lists host capabilities ({@link PluginPermission}).
 */

/** Lowercase dotted segments, at least two, for example `acme.widgets.read`. */
export const PLUGIN_PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export const PLUGIN_PERMISSION_KEY_MAX_LENGTH = 100;

/** Namespaces of the core catalog. A plugin key must not start with one of them. */
export const RESERVED_PERMISSION_NAMESPACES = ['resources.', 'users.', 'system.', 'billing.'] as const;

/** The system roles a plugin may grant its keys to on first registration. */
export const PLUGIN_PERMISSION_DEFAULT_ROLES = [
  'user',
  'resource-manager',
  'user-manager',
  'billing-manager',
  'system-admin',
  'administrator',
] as const;

export type PluginPermissionDefaultRole = (typeof PLUGIN_PERMISSION_DEFAULT_ROLES)[number];

export const PLUGIN_PERMISSION_LIMITS = {
  permissionsPerPlugin: 64,
  labelLength: 120,
  descriptionLength: 500,
} as const;

declare const pluginPermissionKeyBrand: unique symbol;

/** A key returned by {@link definePluginPermissions}. Only declared keys carry the brand. */
export type PluginPermissionKey<K extends string = string> = K & { readonly [pluginPermissionKeyBrand]: true };

/** What `@Auth`, `@AuthAny`, `@SessionAuth` and `resourceAccess.hasPermission` accept. */
export type PermissionKey = SystemPermission | PluginPermissionKey;

export interface PluginPermissionDefinition<K extends string = string> {
  readonly key: K;
  readonly label: PluginLocalizedLabel;
  readonly description: PluginLocalizedLabel;
  /**
   * System roles that receive the key when the host registers it for the first time. Later boots never grant it
   * again, so an administrator's removal sticks. `administrator` always holds every plugin key, listed or not.
   */
  readonly defaultRoles?: readonly PluginPermissionDefaultRole[];
}

export interface PluginPermissionsDeclaration {
  /** Group label in the role editor. Defaults to the plugin name from the manifest. */
  readonly category?: PluginLocalizedLabel;
  readonly permissions: readonly PluginPermissionDefinition[];
}

export type DefinedPluginPermissions<P extends readonly PluginPermissionDefinition[]> = PluginPermissionsDeclaration & {
  readonly permissions: P;
  /** The declared keys, typed for `@Auth` and friends. */
  readonly keys: { readonly [D in P[number] as D['key']]: PluginPermissionKey<D['key']> };
};

/** Declares a plugin's permission keys and returns them typed for the auth decorators. */
export function definePluginPermissions<const P extends readonly PluginPermissionDefinition[]>(declaration: {
  category?: PluginLocalizedLabel;
  permissions: P;
}): DefinedPluginPermissions<P> {
  const keys = Object.fromEntries(declaration.permissions.map((permission) => [permission.key, permission.key]));
  return Object.freeze({ ...declaration, keys: Object.freeze(keys) }) as DefinedPluginPermissions<P>;
}

// Realm-agnostic: plugin code may build its declaration in another realm, whose Object.prototype differs.
const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};

function validateLocalized(where: string, value: unknown, maxLength: number): void {
  if (!isPlainRecord(value)) throw new Error(`${where} must be an object with "en" and "de"`);
  for (const locale of ['en', 'de']) {
    const text = value[locale];
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > maxLength)
      throw new Error(`${where}.${locale} must be 1-${maxLength} characters`);
  }
}

/** Why `key` cannot be a plugin permission key, or null when its shape is valid. */
export function pluginPermissionKeyError(key: unknown): string | null {
  if (
    typeof key !== 'string' ||
    key.length > PLUGIN_PERMISSION_KEY_MAX_LENGTH ||
    !PLUGIN_PERMISSION_KEY_PATTERN.test(key)
  )
    return `must match ${PLUGIN_PERMISSION_KEY_PATTERN.source} and be at most ${PLUGIN_PERMISSION_KEY_MAX_LENGTH} characters`;
  const reserved = RESERVED_PERMISSION_NAMESPACES.find((namespace) => key.startsWith(namespace));
  if (reserved) return `must not use the reserved core namespace "${reserved}"`;
  return null;
}

/**
 * Validates a plugin's permission declaration and returns it unchanged. Throws a descriptive error on any
 * violation; the host quarantines the plugin in that case. Collisions with core keys and with keys of other
 * plugins are checked by the host.
 */
export function validatePluginPermissionsDeclaration(declaration: unknown): PluginPermissionsDeclaration {
  if (!isPlainRecord(declaration)) throw new Error('Plugin permissions must be a plain object');
  if (declaration.category !== undefined)
    validateLocalized('Plugin permissions category', declaration.category, PLUGIN_PERMISSION_LIMITS.labelLength);
  const permissions = declaration.permissions;
  if (!Array.isArray(permissions) || permissions.length === 0)
    throw new Error('Plugin permissions: permissions must be a non-empty array');
  if (permissions.length > PLUGIN_PERMISSION_LIMITS.permissionsPerPlugin)
    throw new Error(`Plugin permissions: at most ${PLUGIN_PERMISSION_LIMITS.permissionsPerPlugin} keys`);
  const seen = new Set<string>();
  for (const entry of permissions) {
    if (!isPlainRecord(entry)) throw new Error('Plugin permission: each entry must be a plain object');
    const key = entry.key;
    const keyError = pluginPermissionKeyError(key);
    if (keyError) throw new Error(`Plugin permission "${String(key)}": key ${keyError}`);
    const where = `Plugin permission "${key as string}"`;
    if (seen.has(key as string)) throw new Error(`${where}: declared twice`);
    seen.add(key as string);
    for (const property of Object.keys(entry))
      if (!['key', 'label', 'description', 'defaultRoles'].includes(property))
        throw new Error(`${where}: unknown property "${property}"`);
    validateLocalized(`${where}: label`, entry.label, PLUGIN_PERMISSION_LIMITS.labelLength);
    validateLocalized(`${where}: description`, entry.description, PLUGIN_PERMISSION_LIMITS.descriptionLength);
    if (entry.defaultRoles !== undefined) {
      if (!Array.isArray(entry.defaultRoles)) throw new Error(`${where}: defaultRoles must be an array`);
      for (const role of entry.defaultRoles)
        if (!(PLUGIN_PERMISSION_DEFAULT_ROLES as readonly unknown[]).includes(role))
          throw new Error(
            `${where}: default role "${String(role)}" is not a system role (${PLUGIN_PERMISSION_DEFAULT_ROLES.join(', ')})`,
          );
    }
  }
  return declaration as unknown as PluginPermissionsDeclaration;
}

import type { TransactionScope } from '../../database/unit-of-work';

/** A row of the permission catalog as the plugin permission sync sees it. */
export interface PermissionCatalogEntry {
  key: string;
  /** The declaring plugin; null for core permissions. */
  pluginName: string | null;
  available: boolean;
}

/** The texts a plugin declares for one of its permissions, as stored in the catalog. */
export interface PluginPermissionTexts {
  label: string;
  labelDe: string;
  description: string;
  descriptionDe: string;
  category: string;
  categoryLabel: string;
  categoryLabelDe: string;
}

/**
 * The permission catalog rows plugins declare. Every operation runs in the caller's unit of work, so one boot's sync
 * commits or rolls back as a whole. Rows are never deleted: role and API-token grants reference them.
 */
export interface PluginPermissionCatalogStore {
  listCatalog(scope: TransactionScope): Promise<PermissionCatalogEntry[]>;
  /** Inserts a new, available plugin permission. */
  registerPluginPermission(
    key: string,
    pluginName: string,
    texts: PluginPermissionTexts,
    scope: TransactionScope,
  ): Promise<void>;
  /** Stores the plugin's current texts and makes the permission available. */
  refreshPluginPermission(key: string, texts: PluginPermissionTexts, scope: TransactionScope): Promise<void>;
  markUnavailable(key: string, scope: TransactionScope): Promise<void>;
  /** Grants the permission to the system-managed roles with these keys; existing grants stay as they are. */
  grantToSystemRoles(permissionKey: string, roleKeys: readonly string[], scope: TransactionScope): Promise<void>;
}

export const PLUGIN_PERMISSION_CATALOG_STORE = Symbol.for('attraccess.users-and-auth.plugin-permission-catalog-store');

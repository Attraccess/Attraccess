/**
 * Module-level registry of plugin-declared RBAC permission keys.
 *
 * Populated during PluginModule.forRoot, before the DI container starts — the same pattern as the audit domain
 * registry. A declaration is validated twice: the SDK validator checks its shape (format, reserved namespaces,
 * duplicates, system roles), and this registry checks host-level ownership: no core key, and no key another plugin
 * declared in this boot or owned in an earlier one. A violation throws, which quarantines only the declaring plugin.
 *
 * The database is not open yet at that point, so the bootstrap preloads the recorded owners first
 * ({@link setRecordedPermissionOwners}). The catalog rows themselves are written after the host migrations ran, by
 * PluginPermissionSyncService.
 */

import {
  PluginLocalizedLabel,
  PluginPermissionDefaultRole,
  validatePluginPermissionsDeclaration,
} from '@attraccess/plugins-backend-sdk';
import { SYSTEM_PERMISSIONS } from '@attraccess/shared';

export interface DeclaredPluginPermission {
  readonly key: string;
  readonly pluginName: string;
  readonly label: PluginLocalizedLabel;
  readonly description: PluginLocalizedLabel;
  readonly category: PluginLocalizedLabel;
  readonly defaultRoles: readonly PluginPermissionDefaultRole[];
}

const declared = new Map<string, DeclaredPluginPermission>();

/** key → owning plugin name, or null for a core key; as recorded in the permission table at boot. */
let recordedOwners: ReadonlyMap<string, string | null> = new Map();

export function setRecordedPermissionOwners(owners: ReadonlyMap<string, string | null>): void {
  recordedOwners = owners;
}

function ownershipError(pluginName: string, key: string): string | null {
  if ((SYSTEM_PERMISSIONS as readonly string[]).includes(key) || recordedOwners.get(key) === null)
    return `"${key}": it is a core permission`;
  const declaredBy = declared.get(key)?.pluginName;
  if (declaredBy && declaredBy !== pluginName) return `"${key}": it is already declared by plugin "${declaredBy}"`;
  const recordedBy = recordedOwners.get(key);
  if (recordedBy && recordedBy !== pluginName) return `"${key}": it is owned by plugin "${recordedBy}"`;
  return null;
}

/**
 * Validates a plugin's permission declaration and returns a function that registers it. Callers register only once
 * the plugin module was built, so a plugin that fails later in loading leaves no keys behind.
 */
export function preparePluginPermissions(pluginName: string, declaration: unknown): { register(): void } {
  if (declaration === undefined) return { register: () => undefined };
  let validated;
  try {
    // Validate and store one plain-data snapshot: getters on the plugin's object could otherwise return one key to
    // the checks and another to the registry.
    validated = validatePluginPermissionsDeclaration(structuredClone(declaration));
  } catch (error) {
    throw new Error(`Plugin ${pluginName} declares invalid permissions: ${(error as Error).message}`);
  }
  const category = validated.category ?? { en: pluginName, de: pluginName };
  const entries: DeclaredPluginPermission[] = validated.permissions.map((permission) => {
    const error = ownershipError(pluginName, permission.key);
    if (error) throw new Error(`Plugin ${pluginName} cannot declare permission ${error}`);
    return {
      key: permission.key,
      pluginName,
      label: { en: permission.label.en, de: permission.label.de },
      description: { en: permission.description.en, de: permission.description.de },
      category: { en: category.en, de: category.de },
      defaultRoles: [...new Set(permission.defaultRoles ?? [])],
    };
  });
  return {
    register: () => {
      // A plugin registers once per boot; drop keys a repeated registration no longer declares.
      for (const [key, entry] of declared) if (entry.pluginName === pluginName) declared.delete(key);
      for (const entry of entries) declared.set(entry.key, entry);
    },
  };
}

export function getDeclaredPluginPermissions(): DeclaredPluginPermission[] {
  return [...declared.values()];
}

/** Test seam: forget every registration and recorded owner. */
export function resetPluginPermissionRegistry(): void {
  declared.clear();
  recordedOwners = new Map();
}

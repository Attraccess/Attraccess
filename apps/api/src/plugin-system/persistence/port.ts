import type { PluginPersistenceDeclaration } from '@attraccess/plugins-backend-sdk/v2';

export interface PluginBackendRequirement {
  readonly name: string;
  readonly persistence?: PluginPersistenceDeclaration;
}

/** Must run before loading schema code, consulting migration history or opening a connection. */
export function assertPluginBackendSupport(plugin: PluginBackendRequirement, backend: string): void {
  if (!plugin.persistence) {
    if (backend === 'sqlite') return;
    throw new Error(`Plugin "${plugin.name}" uses the legacy SQLite-only persistence interface.`);
  }
  if (
    plugin.persistence.contractVersion !== 2 ||
    !Array.isArray(plugin.persistence.supportedBackends) ||
    plugin.persistence.supportedBackends.length === 0 ||
    !plugin.persistence.supportedBackends.includes(backend)
  ) {
    throw new Error(`Plugin "${plugin.name}" does not support the selected database backend.`);
  }
}

/** Migration names are durable plugin history; engine objects stay inside the backend. */
export interface PluginMigrationPersistence {
  readonly backend: string;
  hasMigrations(manifest: import('../plugin.manifest').LoadedPluginManifest): boolean;
  migrationNames(manifest: import('../plugin.manifest').LoadedPluginManifest, root?: string): readonly string[];
  appliedNames(manifest: import('../plugin.manifest').LoadedPluginManifest, root?: string): Promise<readonly string[]>;
  up(manifest: import('../plugin.manifest').LoadedPluginManifest): Promise<readonly string[]>;
  down(manifest: import('../plugin.manifest').LoadedPluginManifest): Promise<number>;
  tableName(manifest: { readonly name: string }): string;
}

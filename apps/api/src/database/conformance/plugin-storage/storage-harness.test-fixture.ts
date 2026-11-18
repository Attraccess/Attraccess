import type { PluginStorageDefinition, PluginStorageTablesApi } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from '../../../plugin-system/plugin-storage/storage-schema';
import type { CompiledPluginStorage } from '../../../plugin-system/plugin-storage/storage-model';
import { PLUGIN, itemsV3, storageV3 } from './storage-declarations.test-fixture';
import type { StorageBackendFixture, StorageConnection, StorageDatabase } from './storage-fixture';

export type ItemsTables = PluginStorageTablesApi<{ items: typeof itemsV3; notes: never }>;

export interface Harness {
  readonly db: StorageDatabase;
  readonly compiled: CompiledPluginStorage;
  compile(definition: PluginStorageDefinition, plugin?: string): CompiledPluginStorage;
  /** A new independent connection with the plugin's contexts opened on it. */
  open(): Promise<{
    connection: StorageConnection;
    persistence: ReturnType<StorageConnection['contexts']>['persistence'];
    tables: PluginStorageTablesApi<PluginStorageDefinition['tables']> & Record<string, never>;
    items: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    notes: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }>;
}

/** A database with the full conformance plugin migrated, ready to open connections on. */
export async function createHarness(fixture: StorageBackendFixture, migrate = true): Promise<Harness> {
  const db = await fixture.create();
  const compile = (definition: PluginStorageDefinition, plugin = PLUGIN) =>
    compilePluginStorage(plugin, definition, { reservedTables: db.coreTables() });
  const compiled = compile(storageV3);
  if (migrate) await db.engine.migrate(compiled);
  return {
    db,
    compiled,
    compile,
    async open() {
      const connection = await db.connect();
      const contexts = connection.contexts(PLUGIN, compiled);
      const tables = contexts.storage.open(storageV3) as never;
      return {
        connection,
        persistence: contexts.persistence,
        tables,
        items: (tables as Record<string, unknown>).items,
        notes: (tables as Record<string, unknown>).notes,
      };
    },
  };
}

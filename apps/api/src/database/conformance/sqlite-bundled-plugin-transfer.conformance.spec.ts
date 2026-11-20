import type { DataSource } from 'typeorm';
import {
  type CompiledPluginStorage,
  PluginStorageMigrationFailed,
  PluginStorageMigrationRefused,
} from '../../plugin-system/plugin-storage/storage-model';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { sha256, urlOf } from '../../e2e/migrations/fixtures/sqlite-transfer.test-fixture';
import { createPostgresPluginPersistenceHost } from '../postgres/plugin-storage/postgres-plugin-storage';
import { postgresBackend } from '../postgres/postgres-backend';
import { appliedStorageVersions } from '../postgres/postgres-transfer';
import { createSqliteSource } from '../sqlite/sqlite-source';
import {
  copyMigratedSqlite,
  createSqliteWorkspace,
  disposeMigratedSqliteTemplate,
  type SqliteWorkspace,
} from '../transfer/sqlite-import.test-fixture';
import { transferSqliteToPostgres } from '../transfer/sqlite-to-postgres';
import { SqliteTransferError } from '../transfer/transfer-errors';
import type { DatabaseSnapshot, PluginDescriptor } from '../transfer-snapshot';
import {
  type BundledPluginStorage,
  BUNDLED_PLUGINS,
  loadBundledPlugins,
} from './plugin-storage/bundled-plugins.test-fixture';
import {
  seedLegacyInstallation,
  seedLegacyRows,
  tablesInOrder,
  writeRow,
} from './plugin-storage/legacy-adoption.test-fixture';
import type { StorageDatabase } from './plugin-storage/storage-fixture';

jest.setTimeout(300_000);

type Row = Record<string, unknown>;
type Tables = Record<string, { find(query?: object): Promise<Row[]>; insert(row: object): Promise<Row> }>;

const quiet = { log: () => undefined, warn: () => undefined };

/** The part of a storage database the 1.x seeding helpers use, on one connection to the SQLite file. */
function sqliteSeeder(source: DataSource): StorageDatabase {
  return {
    flavor: 'sqlite',
    execute: async (sql: string) => {
      await source.query(sql);
    },
    committed: (sql: string) => source.query(sql),
  } as Partial<StorageDatabase> as StorageDatabase;
}

/**
 * The upgrade path of the bundled plugins' data: the SQLite file of a 1.x installation holds the tables its TypeORM
 * migrations created (each plugin's real 1.x DDL: partial unique indexes, Matter's blob kept as text) and their
 * history. The transfer adopts them on its working copy as version 1, runs the later versions there, and imports the
 * rows into PostgreSQL, where the installed plugin's storage was created at the same versions.
 */
describe.each(BUNDLED_PLUGINS)(
  'SQLite -> PostgreSQL transfer of the 1.x tables of the bundled plugin %s',
  (pluginName) => {
    let plugin: BundledPluginStorage;
    let compiled: CompiledPluginStorage;
    let descriptor: PluginDescriptor;
    let workspace: SqliteWorkspace;
    let target: DataSource;

    beforeAll(async () => {
      process.env.AUTH_SESSION_SECRET ||= 'bundled-plugin-transfer-secret';
      plugin = (await loadBundledPlugins()).find((candidate) => candidate.name === pluginName) as BundledPluginStorage;
      compiled = compilePluginStorage(pluginName, plugin.storage, {
        reservedTables: postgresBackend.plugins.coreTableNames(),
      });
      descriptor = { id: pluginName, version: '2.0.0', storage: compiled };
    });

    beforeEach(async () => {
      workspace = await createSqliteWorkspace();
      await copyMigratedSqlite(workspace.file);
      target = await createTestDataSource();
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await closeTestDataSource(target);
      await workspace.remove();
    });

    afterAll(disposeMigratedSqliteTemplate);

    /** The plugin's 1.x DDL and history (complete unless `applied` says otherwise) and one row per table. */
    async function installLegacy(applied?: readonly string[]): Promise<{ expected: ReadonlyMap<string, Row> }> {
      const source = createSqliteSource(workspace.file);
      await source.initialize();
      try {
        const db = sqliteSeeder(source);
        await seedLegacyInstallation(db, plugin, applied);
        const indexes: { name: string }[] = await source.query(`SELECT name FROM sqlite_master WHERE type = 'index'`);
        // The 1.x layout is in place, including what the neutral schema cannot declare.
        expect(indexes.map((index) => index.name)).toEqual(
          expect.arrayContaining([...(plugin.legacyOnly?.partialUniqueIndexes ?? [])]),
        );
        return await seedLegacyRows(db, compiled);
      } finally {
        await source.destroy();
      }
    }

    const transfer = () =>
      transferSqliteToPostgres({
        sqliteFile: workspace.file,
        target,
        plugins: [descriptor],
        targetPluginEngine: postgresBackend.plugins.createMigrationEngine({
          type: 'postgres',
          url: urlOf(target),
        } as never),
        logger: quiet,
        markMigrated: false,
      });

    const physicalTables = () => [...compiled.tables.values()].map((table) => table.physical).sort();
    const pluginTablesInTarget = async (): Promise<string[]> => {
      const rows: { table_name: string }[] = await target.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1)`,
        [physicalTables()],
      );
      return rows.map((row) => row.table_name).sort();
    };

    it('adopts a complete 1.x history on the copy and imports every row at the same storage versions', async () => {
      const { expected } = await installLegacy();
      const before = await sha256(workspace.file);
      const imported = jest.spyOn(postgresBackend.transfer, 'importSnapshot');

      const summary = await transfer();

      const versions = compiled.migrations.map((migration) => migration.version);
      const snapshot = imported.mock.calls[0][1] as DatabaseSnapshot;
      expect(snapshot.plugins).toEqual([
        expect.objectContaining({ id: pluginName, storage: { namespace: compiled.namespace, versions } }),
      ]);
      expect(await appliedStorageVersions(target, compiled.namespace)).toEqual(versions);
      expect(summary.plugins).toEqual([pluginName]);
      for (const table of tablesInOrder(compiled, compiled.migrations[0].schemaAfter)) {
        expect([table.physical, summary.tables[table.physical]]).toEqual([table.physical, 1]);
      }
      expect(await sha256(workspace.file)).toBe(before);

      // The rows read back through the record port as the 1.x code stored them, and new writes continue after them.
      const host = createPostgresPluginPersistenceHost(() => target);
      const tables = host.createContexts(pluginName, compiled).storage.open(plugin.storage as never) as never as Tables;
      for (const [logical, row] of expected) {
        expect([logical, await tables[logical].find()]).toEqual([logical, [expect.objectContaining(row)]]);
      }
      const written = new Map<string, Row>(expected);
      for (const table of tablesInOrder(compiled, compiled.tables)) {
        written.set(table.logical, await tables[table.logical].insert(writeRow(table, written)));
        const rows = await tables[table.logical].find();
        expect([table.logical, rows.length]).toEqual([table.logical, expected.has(table.logical) ? 2 : 1]);
      }
    });

    it('refuses a partial 1.x history on the copy, imports nothing and leaves the SQLite file untouched', async () => {
      const legacy = compiled.legacyMigrations;
      await installLegacy(legacy.slice(0, -1));
      const before = await sha256(workspace.file);

      const error = await transfer().catch((caught) => caught);

      expect(error).toBeInstanceOf(SqliteTransferError);
      expect(error.step).toBe(`migrating the storage of plugin ${pluginName} in the copy`);
      // A partial history is refused for good (the SQLite file needs 1.11 first); a failed migration may pass on retry.
      expect(error.outcome).toBe(legacy.length > 1 ? 'refused' : 'rolled-back');
      // With a single 1.x migration, an empty history is a fresh install: creating the existing tables fails.
      expect(error.cause).toBeInstanceOf(
        legacy.length > 1 ? PluginStorageMigrationRefused : PluginStorageMigrationFailed,
      );
      if (legacy.length > 1) {
        expect(error.message).toMatch(/update to Attraccess 1\.11 and start it once/);
        expect(error.message).toContain('The SQLite file was not changed and needs no restore');
        expect(error.message).toContain('Nothing was changed: neither the SQLite file nor the PostgreSQL database.');
        expect(error.message).not.toMatch(/Restore the backup|the next start retries/);
      }
      expect(await sha256(workspace.file)).toBe(before);
      expect(await pluginTablesInTarget()).toEqual([]);
      expect(await appliedStorageVersions(target, compiled.namespace)).toEqual([]);
    });
  },
);

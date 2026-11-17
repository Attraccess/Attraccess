import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DataSource, DataSourceOptions, MigrationExecutor } from 'typeorm';
import type {
  PluginMigrationClassRef,
  PluginMigrationEngine,
  PluginMigrationEngineConfig,
} from '../../plugin-system/persistence/plugin-migration-engine.port';
import { createDataSource, SQLITE_BUSY_TIMEOUT_MS } from './sqlite-connection';

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * SQLite migration engine of the plugin lifecycle. Each call opens a short-lived standalone connection to the same
 * database file: plugin up-migrations may run before the host connection exists (boot) and down-migrations run while
 * it is idle (uninstall). SQLite serialises writers per file, so the connection waits a little for a transient lock.
 */
class SqlitePluginMigrationEngine implements PluginMigrationEngine {
  constructor(private readonly base: () => DataSourceOptions) {}

  private open(tableName: string, migrations: PluginMigrationClassRef[]): DataSource {
    const base = this.base();
    const databaseFile = (base as { database?: unknown }).database;
    if (typeof databaseFile === 'string') {
      // The host normally creates the storage dir, but plugin up-migrations may run before the host connection
      // opens on a fresh install.
      mkdirSync(dirname(databaseFile), { recursive: true });
    }
    return createDataSource({
      ...base,
      entities: [],
      synchronize: false,
      migrationsRun: false,
      migrations,
      migrationsTableName: tableName,
    } as DataSourceOptions);
  }

  private async withConnection<T>(
    tableName: string,
    migrations: PluginMigrationClassRef[],
    work: (source: DataSource) => Promise<T>,
  ): Promise<T> {
    const source = this.open(tableName, migrations);
    await source.initialize();
    try {
      await source.query(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
      return await work(source);
    } finally {
      await source.destroy();
    }
  }

  async listApplied(tableName: string): Promise<string[]> {
    return this.withConnection(tableName, [], async (source) =>
      (await new MigrationExecutor(source).getExecutedMigrations()).map(({ name }) => name),
    );
  }

  async runUp(tableName: string, migrations: PluginMigrationClassRef[]): Promise<string[]> {
    return this.withConnection(tableName, migrations, async (source) =>
      (await source.runMigrations({ transaction: 'all' })).map((migration) => migration.name),
    );
  }

  async revertAll(tableName: string, migrations: PluginMigrationClassRef[]): Promise<number> {
    return this.withConnection(tableName, migrations, async (source) => {
      const executed = await new MigrationExecutor(source).getExecutedMigrations();
      for (let i = 0; i < executed.length; i++) {
        await source.undoLastMigration({ transaction: 'all' });
      }
      // Nothing left to track: remove the plugin's bookkeeping table too.
      await source.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
      return executed.length;
    });
  }
}

/** The SQLite plugin migration engine. `config` (tests only) replaces the application's connection options. */
export function createSqlitePluginMigrationEngine(
  config: PluginMigrationEngineConfig | null,
  applicationOptions: () => DataSourceOptions,
): PluginMigrationEngine {
  return new SqlitePluginMigrationEngine(() => (config as DataSourceOptions | null) ?? applicationOptions());
}

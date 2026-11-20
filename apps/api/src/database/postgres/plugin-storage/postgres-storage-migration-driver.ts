import { DataSource, type DataSourceOptions, type EntityManager } from 'typeorm';
import type {
  PluginStorageMigrationDriver,
  PluginStorageMigrationReader,
  PluginStorageMigrationSession,
} from '../../../plugin-system/plugin-storage/storage-dialect.port';
import {
  type CompiledPluginStorage,
  type CompiledSchema,
  type PluginStorageOwner,
  type ResolvedStep,
  legacyMigrationsTableName,
  versionsTableName,
} from '../../../plugin-system/plugin-storage/storage-model';
import { createRecordPort } from '../../../plugin-system/plugin-storage/storage-records';
import { postgresStorageDialect } from './postgres-storage-dialect';
import { PostgresManagerExecutor } from './postgres-storage-sessions';
import { checkPostgresStep } from './postgres-storage-step-guard';

const { quote } = postgresStorageDialect;

class PostgresMigrationSession implements PluginStorageMigrationSession {
  private readonly executor: PostgresManagerExecutor;
  private readonly versions: string;
  private readonly legacy: string;

  constructor(
    private readonly manager: EntityManager,
    owner: PluginStorageOwner,
  ) {
    this.executor = new PostgresManagerExecutor(manager);
    this.versions = versionsTableName(owner.namespace);
    this.legacy = legacyMigrationsTableName(owner.pluginName);
  }

  private async tableExists(name: string): Promise<boolean> {
    const rows = await this.manager.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
      [name],
    );
    return rows.length > 0;
  }

  async appliedVersions(): Promise<number[]> {
    if (!(await this.tableExists(this.versions))) return [];
    const rows = await this.manager.query(`SELECT "version" FROM ${quote(this.versions)} ORDER BY "version"`);
    return rows.map((row: { version: number }) => Number(row.version));
  }

  async recordVersion(entry: { version: number; name: string; source: 'migrated' | 'adopted' }): Promise<void> {
    await this.manager.query(
      `CREATE TABLE IF NOT EXISTS ${quote(this.versions)} ("version" integer PRIMARY KEY NOT NULL, "name" varchar NOT NULL, ` +
        `"source" varchar NOT NULL, "appliedAt" timestamptz NOT NULL)`,
    );
    await this.executor.execute(
      `INSERT INTO ${quote(this.versions)} ("version", "name", "source", "appliedAt") VALUES ($1, $2, $3, $4)`,
      [entry.version, entry.name, entry.source, new Date()],
    );
  }

  async legacyMigrationNames(): Promise<string[] | null> {
    if (!(await this.tableExists(this.legacy))) return null;
    const rows = await this.manager.query(`SELECT "name" FROM ${quote(this.legacy)} ORDER BY "id"`);
    return rows.map((row: { name: string }) => row.name);
  }

  async execute(statements: readonly string[]): Promise<void> {
    for (const statement of statements) await this.manager.query(statement);
  }

  checkStep(step: ResolvedStep): Promise<void> {
    return checkPostgresStep((sql, params) => this.manager.query(sql, params as unknown[]), step);
  }

  recordPort(schema: CompiledSchema): unknown {
    return createRecordPort(schema, postgresStorageDialect, { run: (_access, _scope, work) => work(this.executor) });
  }

  async dropAll(tables: readonly string[], options: { readonly keepLegacyHistory: boolean }): Promise<void> {
    // Children first: the plugin's tables are listed parents before children. No CASCADE: nothing else is touched.
    for (const table of [...tables].reverse()) await this.manager.query(`DROP TABLE IF EXISTS ${quote(table)}`);
    await this.manager.query(`DROP TABLE IF EXISTS ${quote(this.versions)}`);
    if (!options.keepLegacyHistory) await this.manager.query(`DROP TABLE IF EXISTS ${quote(this.legacy)}`);
  }

  /** Serialises migrations of one plugin across processes (replicas starting together); released at commit. */
  async lock(): Promise<void> {
    await this.manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `attraccess:plugin-storage:${this.versions}`,
    ]);
  }
}

/**
 * Migration driver of the PostgreSQL plugin storage. Each call opens a short-lived standalone connection to the same
 * database: plugin migrations may run before the host connection exists (boot) and drops run while it is idle
 * (uninstall). DDL is transactional on PostgreSQL, so a failed step leaves nothing behind.
 */
export class PostgresStorageMigrationDriver implements PluginStorageMigrationDriver {
  constructor(private readonly base: () => DataSourceOptions) {}

  private open(): DataSource {
    const base = this.base() as DataSourceOptions & { extra?: Record<string, unknown> };
    const options = {
      ...base,
      entities: [],
      synchronize: false,
      migrationsRun: false,
      migrations: [],
      poolSize: 1,
      extra: { ...base.extra, max: 1 },
    };
    return new DataSource(options as DataSourceOptions);
  }

  async read<T>(owner: PluginStorageOwner, work: (session: PluginStorageMigrationReader) => Promise<T>): Promise<T> {
    const source = this.open();
    await source.initialize();
    try {
      return await source.transaction(async (manager) => {
        // Takes no row or table lock: planning neither waits behind writers nor blocks them.
        await manager.query('SET TRANSACTION READ ONLY');
        return work(new PostgresMigrationSession(manager, owner));
      });
    } finally {
      await source.destroy();
    }
  }

  async transaction<T>(
    storage: CompiledPluginStorage,
    work: (session: PluginStorageMigrationSession) => Promise<T>,
  ): Promise<T> {
    const source = this.open();
    await source.initialize();
    try {
      return await source.transaction(async (manager) => {
        const session = new PostgresMigrationSession(manager, storage);
        await session.lock();
        return work(session);
      });
    } finally {
      await source.destroy();
    }
  }
}

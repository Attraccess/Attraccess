import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DataSource, type DataSourceOptions, type EntityManager } from 'typeorm';
import type {
  PluginStorageMigrationDriver,
  PluginStorageMigrationReader,
  PluginStorageMigrationSession,
} from '../../../plugin-system/plugin-storage/storage-dialect.port';
import {
  type CompiledPluginStorage,
  type CompiledSchema,
  type ResolvedStep,
  legacyMigrationsTableName,
  versionsTableName,
} from '../../../plugin-system/plugin-storage/storage-model';
import { createRecordPort } from '../../../plugin-system/plugin-storage/storage-records';
import { createDataSource, SQLITE_BUSY_TIMEOUT_MS } from '../sqlite-connection';
import { formatSqliteTimestamp, sqliteStorageDialect } from './sqlite-storage-dialect';
import { checkSqliteStep } from './sqlite-storage-step-guard';
import { ManagerExecutor } from './sqlite-storage-sessions';

const { quote } = sqliteStorageDialect;

class SqliteMigrationSession implements PluginStorageMigrationSession {
  private readonly executor: ManagerExecutor;
  private readonly versions: string;
  private readonly legacy: string;

  constructor(
    private readonly manager: EntityManager,
    storage: CompiledPluginStorage,
  ) {
    this.executor = new ManagerExecutor(manager);
    this.versions = versionsTableName(storage.namespace);
    this.legacy = legacyMigrationsTableName(storage.pluginName);
  }

  private async tableExists(name: string): Promise<boolean> {
    const rows = await this.manager.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
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
        `"source" varchar NOT NULL, "appliedAt" datetime NOT NULL)`,
    );
    await this.executor.execute(
      `INSERT INTO ${quote(this.versions)} ("version", "name", "source", "appliedAt") VALUES (?, ?, ?, ?)`,
      [entry.version, entry.name, entry.source, formatSqliteTimestamp(new Date())],
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
    return checkSqliteStep((sql, params) => this.manager.query(sql, params as unknown[]), step);
  }

  recordPort(schema: CompiledSchema): unknown {
    return createRecordPort(schema, sqliteStorageDialect, { run: (_access, _scope, work) => work(this.executor) });
  }

  async dropAll(tables: readonly string[], options: { readonly keepLegacyHistory: boolean }): Promise<void> {
    // Children first: the plugin's tables are listed parents before children.
    for (const table of [...tables].reverse()) await this.manager.query(`DROP TABLE IF EXISTS ${quote(table)}`);
    await this.manager.query(`DROP TABLE IF EXISTS ${quote(this.versions)}`);
    if (!options.keepLegacyHistory) await this.manager.query(`DROP TABLE IF EXISTS ${quote(this.legacy)}`);
  }
}

/**
 * Migration driver of the SQLite plugin storage. Each call opens a short-lived standalone connection to the same
 * database file: plugin migrations may run before the host connection exists (boot) and drops run while it is idle
 * (uninstall). SQLite serialises writers per file, so the connection waits a little for a transient lock.
 */
export class SqliteStorageMigrationDriver implements PluginStorageMigrationDriver {
  constructor(private readonly base: () => DataSourceOptions) {}

  private open(readOnly = false): DataSource {
    const base = this.base();
    const databaseFile = (base as { database?: unknown }).database;
    if (typeof databaseFile === 'string') {
      // The host normally creates the storage dir, but plugin migrations may run before the host connection opens
      // on a fresh install.
      mkdirSync(dirname(databaseFile), { recursive: true });
    }
    const options = { ...base, entities: [], synchronize: false, migrationsRun: false, migrations: [] };
    // createDataSource turns every transaction into BEGIN IMMEDIATE (the write lock); a plain source begins deferred.
    return readOnly ? new DataSource(options as DataSourceOptions) : createDataSource(options as DataSourceOptions);
  }

  async read<T>(
    storage: CompiledPluginStorage,
    work: (session: PluginStorageMigrationReader) => Promise<T>,
  ): Promise<T> {
    const source = this.open(true);
    await source.initialize();
    try {
      await source.query(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
      await source.query('PRAGMA query_only = ON');
      // A deferred transaction: both reads see one consistent state without reserving the writer.
      return await source.transaction((manager) => work(new SqliteMigrationSession(manager, storage)));
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
      await source.query(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
      return await source.transaction((manager) => work(new SqliteMigrationSession(manager, storage)));
    } finally {
      await source.destroy();
    }
  }
}

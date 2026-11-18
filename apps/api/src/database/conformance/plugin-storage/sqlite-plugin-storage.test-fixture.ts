import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resource } from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { createPluginHostData } from '../../adapters/plugins/plugin-host-data.adapter';
import { sqliteBackend } from '../../sqlite/sqlite-backend';
import {
  createSqlitePluginMigrationEngine,
  createSqlitePluginPersistenceHost,
  sqliteHostTransactionScope,
} from '../../sqlite/plugin-storage/sqlite-plugin-storage';
import { registerPersistenceErrorClassifier } from '../../persistence-errors';
import { migratedTemplate } from '../ports/sqlite-port.test-fixture';
import type { StorageBackendFixture, StorageConnection, StorageDatabase } from './storage-fixture';

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** A host connection to `file`, as the application opens it; `busyTimeout` replaces the default wait for the lock. */
const openSqlite = (file: string, busyTimeout?: number) =>
  sqliteBackend
    .createDataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: file,
      timeout: busyTimeout,
      entities: sqliteBackend.entities,
      migrations: sqliteBackend.migrationTrack.migrations,
      migrationsTableName: sqliteBackend.migrationTrack.tableName,
    } as DataSourceOptions)
    .initialize();

/** Real SQLite files, one DataSource (own handle, own unit of work and write queue) per `connect()`. */
export const sqliteStorageFixture: StorageBackendFixture = {
  name: 'sqlite',
  flavor: 'sqlite',
  async create(): Promise<StorageDatabase> {
    registerPersistenceErrorClassifier(sqliteBackend.errors);
    const directory = await mkdtemp(join(tmpdir(), 'plugin-storage-'));
    const file = join(directory, 'storage.sqlite');
    await copyFile(await migratedTemplate(), file);
    const sources: DataSource[] = [];
    const open = async (busyTimeout?: number) => {
      const source = await openSqlite(file, busyTimeout);
      sources.push(source);
      return source;
    };
    const primary = await open();
    const core = sqliteBackend.plugins.coreTableNames();
    const engineOptions = {
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: file,
    } as DataSourceOptions;
    const engine = createSqlitePluginMigrationEngine(engineOptions, () => engineOptions);

    const query = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
      primary.query(sql, params);

    return {
      flavor: 'sqlite',
      engine,
      coreTables: () => core,
      async connect(options = {}): Promise<StorageConnection> {
        const source = await open(options.busyTimeoutMs);
        const unitOfWork = sqliteBackend.createUnitOfWork(source);
        const host = createSqlitePluginPersistenceHost(() => source);
        return {
          contexts: (pluginName, storage) => host.createContexts(pluginName, storage),
          unitOfWork,
          hostScope: (scope) => sqliteHostTransactionScope(unitOfWork, scope),
          hostData: createPluginHostData(() => source),
          async insertResource(scope, name) {
            const manager = unitOfWork.handleOf(scope);
            return (await manager.getRepository(Resource).save({ name, type: ResourceType.Machine })).id;
          },
        };
      },
      async tables() {
        const rows = await query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
        return rows.map((row) => String(row.name)).sort();
      },
      async columns(table) {
        const rows = await query(`PRAGMA table_info(${quote(table)})`);
        return rows.map((row) => ({
          name: String(row.name),
          type: String(row.type).toLowerCase(),
          required: Number(row.notnull) === 1,
          primaryKey: Number(row.pk) > 0,
        }));
      },
      async indexes(table) {
        const rows = await query(
          `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'`,
          [table],
        );
        return rows.map((row) => String(row.name)).sort();
      },
      async snapshot(options = {}) {
        const objects = await query(
          `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
        );
        const except = new Set((options.except ?? []).map((name) => name.toLowerCase()));
        const lines: string[] = [];
        for (const object of objects) {
          const name = String(object.name);
          const owner = String(object.tbl_name).toLowerCase();
          if (core.has(owner) || except.has(owner)) continue;
          lines.push(`${object.type} ${name}: ${String(object.sql)}`);
          if (object.type === 'table') {
            lines.push(JSON.stringify(await query(`SELECT * FROM ${quote(name)} ORDER BY rowid`)));
          }
        }
        return lines.join('\n');
      },
      async committed(sql) {
        // Outside the guarded connections: a statement of the flow that owns a transaction would join it there.
        const plain = await new DataSource({
          type: 'better-sqlite3',
          invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
          database: file,
        }).initialize();
        try {
          return await plain.query(sql);
        } finally {
          await plain.destroy();
        }
      },
      async execute(sql) {
        await query(sql);
      },
      async holdWriteLock() {
        // A plain connection, outside the host's flow guards: it only takes and holds the file's write lock.
        const holder = await new DataSource({
          type: 'better-sqlite3',
          invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
          database: file,
        }).initialize();
        await holder.query('BEGIN IMMEDIATE');
        return async () => {
          await holder.query('ROLLBACK');
          await holder.destroy();
        };
      },
      async seedResource(name) {
        const resource = await primary.getRepository(Resource).save({ name, type: ResourceType.Machine });
        return resource.id;
      },
      async close() {
        for (const source of sources) {
          await sqliteBackend.shutdown(source);
          if (source.isInitialized) await source.destroy();
        }
        await rm(directory, { recursive: true, force: true });
      },
    };
  },
};

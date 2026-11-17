import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resource } from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { createPluginHostData } from '../../adapters/plugins/plugin-host-data.adapter';
import { sqliteBackend } from '../../sqlite/sqlite-backend';
import {
  createSqlitePluginMigrationEngine,
  createSqlitePluginPersistenceHost,
  sqliteHostTransactionScope,
} from '../../sqlite/plugin-storage/sqlite-plugin-storage';
import { registerPersistenceErrorClassifier } from '../../persistence-errors';
import { migratedTemplate, openSqlite } from '../ports/sqlite-port.test-fixture';
import type { StorageBackendFixture, StorageConnection, StorageDatabase } from './storage-fixture';

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Real SQLite files, one DataSource (own handle, own unit of work and write queue) per `connect()`. */
export const sqliteStorageFixture: StorageBackendFixture = {
  name: 'sqlite',
  async create(): Promise<StorageDatabase> {
    registerPersistenceErrorClassifier(sqliteBackend.errors);
    const directory = await mkdtemp(join(tmpdir(), 'plugin-storage-'));
    const file = join(directory, 'storage.sqlite');
    await copyFile(await migratedTemplate(), file);
    const sources: DataSource[] = [];
    const open = async () => {
      const source = await openSqlite(file);
      sources.push(source);
      return source;
    };
    const primary = await open();
    const core = sqliteBackend.plugins.coreTableNames();
    const engineOptions = { type: 'sqlite', database: file } as DataSourceOptions;
    const engine = createSqlitePluginMigrationEngine(engineOptions, () => engineOptions);

    const query = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
      primary.query(sql, params);

    return {
      engine,
      coreTables: () => core,
      async connect(): Promise<StorageConnection> {
        const source = await open();
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
      async snapshot() {
        const objects = await query(
          `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
        );
        const lines: string[] = [];
        for (const object of objects) {
          const name = String(object.name);
          if (core.has(name.toLowerCase()) || (object.type !== 'table' && !/plugin|conf/i.test(name))) continue;
          lines.push(`${object.type} ${name}: ${String(object.sql)}`);
          if (object.type === 'table') {
            lines.push(JSON.stringify(await query(`SELECT * FROM ${quote(name)} ORDER BY rowid`)));
          }
        }
        return lines.join('\n');
      },
      async execute(sql) {
        await query(sql);
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

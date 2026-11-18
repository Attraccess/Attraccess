import { Client } from 'pg';
import { Resource, entities } from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import { DataSource, type DataSourceOptions, type EntityManager } from 'typeorm';
import { createPluginHostData } from '../../adapters/plugins/plugin-host-data.adapter';
import {
  createPostgresPluginMigrationEngine,
  createPostgresPluginPersistenceHost,
  postgresHostTransactionScope,
} from '../../postgres/plugin-storage/postgres-plugin-storage';
import { postgresPluginErrorClassifier } from '../../postgres/plugin-storage/postgres-storage-errors';
import {
  createTestPostgresDatabase,
  type TestPostgresDatabase,
} from '../../postgres/plugin-storage/postgres-test-database.test-fixture';
import { registerPersistenceErrorClassifier } from '../../persistence-errors';
import { ScopedUnitOfWork } from '../../unit-of-work';
import type { StorageBackendFixture, StorageConnection, StorageDatabase } from './storage-fixture';

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const ITEMS_TABLE = 'plugin_conformance_plugin_items';
const DEFAULT_LOCK_TIMEOUT_MS = 10_000;

/** A template with the host's core tables, built once per test process: new databases clone it. */
let template: Promise<{ database: TestPostgresDatabase; name: string; core: ReadonlySet<string> }> | undefined;

function coreTemplate() {
  template ??= (async () => {
    const database = await createTestPostgresDatabase('plugin_storage_template');
    const source = new DataSource({
      type: 'postgres',
      url: database.url,
      entities: Object.values(entities),
      synchronize: true,
    } as DataSourceOptions);
    await source.initialize();
    const core = new Set(source.entityMetadatas.map((metadata) => metadata.tableName.toLowerCase()));
    await source.destroy();
    return { database, name: new URL(database.url).pathname.slice(1), core };
  })();
  return template;
}

/** Drops the core template; call from afterAll of a spec file. */
export async function removePostgresTemplate(): Promise<void> {
  const pending = template;
  template = undefined;
  if (pending) await (await pending).database.drop();
}

async function cloneCoreDatabase(): Promise<{ database: TestPostgresDatabase; core: ReadonlySet<string> }> {
  const { name: source, core } = await coreTemplate();
  const database = await createTestPostgresDatabase('plugin_storage');
  const url = new URL(database.url);
  const admin = new Client({
    connectionString: process.env.TEST_DATABASE_URL ?? 'postgres://attraccess:attraccess@127.0.0.1:55432/postgres',
  });
  await admin.connect();
  try {
    // CREATE DATABASE ... TEMPLATE needs the target name free: replace the empty database the helper created.
    const target = url.pathname.slice(1);
    await admin.query(`DROP DATABASE ${quote(target)}`);
    await admin.query(`CREATE DATABASE ${quote(target)} TEMPLATE ${quote(source)}`);
  } finally {
    await admin.end();
  }
  return { database, core };
}

/** Real PostgreSQL databases, one DataSource (own pool, own unit of work) per `connect()`. */
export const postgresStorageFixture: StorageBackendFixture = {
  name: 'postgres',
  flavor: 'postgres',
  async create(): Promise<StorageDatabase> {
    registerPersistenceErrorClassifier(postgresPluginErrorClassifier);
    const { database, core } = await cloneCoreDatabase();
    const sources: DataSource[] = [];
    const open = async (lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS) => {
      const source = new DataSource({
        type: 'postgres',
        url: database.url,
        invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
        entities: Object.values(entities),
        synchronize: false,
        // A statement waits this long for another connection's lock, then fails with 55P03 (neutral: busy).
        extra: { options: `-c lock_timeout=${lockTimeoutMs}` },
      } as DataSourceOptions);
      await source.initialize();
      sources.push(source);
      return source;
    };
    const primary = await open();
    const engineOptions = { type: 'postgres', url: database.url } as DataSourceOptions;
    const engine = createPostgresPluginMigrationEngine(engineOptions, () => engineOptions);
    const query = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
      primary.query(sql, params);
    const plain = async <T>(work: (client: Client) => Promise<T>): Promise<T> => {
      const client = new Client({ connectionString: database.url });
      await client.connect();
      try {
        return await work(client);
      } finally {
        await client.end();
      }
    };

    return {
      flavor: 'postgres',
      engine,
      coreTables: () => core,
      async connect(options = {}): Promise<StorageConnection> {
        const source = await open(options.busyTimeoutMs);
        const unitOfWork = new ScopedUnitOfWork<EntityManager>({ transaction: (work) => source.transaction(work) });
        const host = createPostgresPluginPersistenceHost(() => source);
        return {
          contexts: (pluginName, storage) => host.createContexts(pluginName, storage),
          unitOfWork,
          hostScope: (scope) => postgresHostTransactionScope(unitOfWork, scope),
          hostData: createPluginHostData(() => source),
          async insertResource(scope, name) {
            const manager = unitOfWork.handleOf(scope);
            return (await manager.getRepository(Resource).save({ name, type: ResourceType.Machine })).id;
          },
        };
      },
      async tables() {
        const rows = await query(
          `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
        );
        return rows.map((row) => String(row.name)).sort();
      },
      async columns(table) {
        const rows = await query(
          `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS required,
                  COALESCE(a.attnum = ANY (k.indkey), false) AS "primaryKey"
             FROM pg_attribute a
             JOIN pg_class t ON t.oid = a.attrelid AND t.relkind = 'r'
             JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = current_schema()
             LEFT JOIN pg_index k ON k.indrelid = t.oid AND k.indisprimary
            WHERE t.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY a.attnum`,
          [table],
        );
        return rows.map((row) => ({
          name: String(row.name),
          type: String(row.type).toLowerCase(),
          required: row.required === true,
          primaryKey: row.primaryKey === true,
        }));
      },
      async indexes(table) {
        const rows = await query(
          `SELECT i.relname AS name
             FROM pg_index x
             JOIN pg_class i ON i.oid = x.indexrelid
             JOIN pg_class t ON t.oid = x.indrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = current_schema()
            WHERE t.relname = $1 AND NOT x.indisprimary`,
          [table],
        );
        return rows.map((row) => String(row.name)).sort();
      },
      async snapshot(options = {}) {
        const except = new Set((options.except ?? []).map((name) => name.toLowerCase()));
        const lines: string[] = [];
        for (const table of await this.tables()) {
          const owner = table.toLowerCase();
          if (core.has(owner) || except.has(owner)) continue;
          lines.push(`table ${table}: ${JSON.stringify(await this.columns(table))}`);
          const indexes = await query(
            `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1 ORDER BY indexname`,
            [table],
          );
          for (const index of indexes) lines.push(`index ${String(index.indexname)}: ${String(index.indexdef)}`);
          const constraints = await query(
            `SELECT c.conname AS name, pg_get_constraintdef(c.oid) AS definition
               FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
               JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = current_schema()
              WHERE t.relname = $1 ORDER BY c.conname`,
            [table],
          );
          for (const constraint of constraints)
            lines.push(`constraint ${String(constraint.name)}: ${String(constraint.definition)}`);
          lines.push(JSON.stringify(await query(`SELECT * FROM ${quote(table)} ORDER BY ctid`)));
        }
        return lines.join('\n');
      },
      // Another process: a plain connection outside the host's pools sees committed rows only.
      committed: (sql) => plain((client) => client.query(sql).then((result) => result.rows)),
      async execute(sql) {
        await query(sql);
      },
      async holdWriteLock() {
        // A plain connection that takes the lock writers need on the items table (reads stay possible).
        const holder = new Client({ connectionString: database.url });
        await holder.connect();
        await holder.query('BEGIN');
        await holder.query(`LOCK TABLE ${quote(ITEMS_TABLE)} IN SHARE ROW EXCLUSIVE MODE`);
        return async () => {
          await holder.query('ROLLBACK');
          await holder.end();
        };
      },
      async seedResource(name) {
        const resource = await primary.getRepository(Resource).save({ name, type: ResourceType.Machine });
        return resource.id;
      },
      async close() {
        for (const source of sources) if (source.isInitialized) await source.destroy();
        await database.drop();
      },
    };
  },
};

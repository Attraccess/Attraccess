import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { definePluginStorage, f, step, table, type PluginStorageMigrationStep } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from '../../../plugin-system/plugin-storage/storage-schema';
import { StorageMigrationRunner } from '../../../plugin-system/plugin-storage/storage-migration-runner';
import { sqliteStorageDdl } from './sqlite-storage-ddl';
import { SqliteStorageMigrationDriver } from './sqlite-storage-migration-driver';
import { checkConstraints } from './sqlite-storage-step-guard';

const LEGACY = 'plugin_migrations_demo';
const DEVICES = 'demo_devices';

/** The 1.x layout: a UNIQUE and a CHECK constraint inside CREATE TABLE, as TypeORM wrote them. */
const LEGACY_DDL = [
  `CREATE TABLE "${DEVICES}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "address" varchar NOT NULL, ` +
    `"state" varchar NOT NULL, "note" varchar, CONSTRAINT "UQ_demo_devices_address" UNIQUE ("address"), ` +
    `CONSTRAINT "CHK_demo_devices_state" CHECK ("state" IN ('a', 'b')))`,
  `CREATE TABLE "${LEGACY}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "timestamp" bigint NOT NULL, "name" varchar NOT NULL)`,
  `INSERT INTO "${LEGACY}" ("timestamp", "name") VALUES (1, 'CreateDevices1700000000000')`,
  `CREATE TABLE "plugin_other_things" ("id" integer PRIMARY KEY NOT NULL, "name" varchar)`,
  `CREATE INDEX "idx_plugin_other_things_name" ON "plugin_other_things" ("name")`,
];

const devices = table(
  { id: f.id(), address: f.string(), state: f.string(), note: f.string().optional() },
  { physicalName: DEVICES, indexes: [{ name: 'UQ_demo_devices_address', fields: ['address'], unique: true }] },
);

/** The adopting declaration followed by a version 2 with `steps`; the head is what those steps leave. */
function adoptingWith(steps: PluginStorageMigrationStep[], head = devices) {
  return compilePluginStorage(
    'demo',
    definePluginStorage({
      tables: { devices: head },
      migrations: [
        { version: 1, name: 'baseline', steps: [step.createTable('devices', devices)] },
        { version: 2, name: 'change', steps },
      ],
      adoption: { legacyMigrations: ['CreateDevices1700000000000'] },
    }),
    { reservedTables: new Set() },
  );
}

describe('SQLite migrations on adopted 1.x tables', () => {
  let root: string;
  let database: string;
  let runner: StorageMigrationRunner;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'step-guard-'));
    database = join(root, 'db.sqlite');
    runner = new StorageMigrationRunner(
      new SqliteStorageMigrationDriver(() => ({
        type: 'better-sqlite3',
        invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
        database,
      })),
      sqliteStorageDdl,
    );
    await sql(...LEGACY_DDL);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  async function sql(...statements: string[]): Promise<Record<string, unknown>[]> {
    const source = new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database,
    });
    await source.initialize();
    try {
      let rows: Record<string, unknown>[] = [];
      for (const statement of statements) rows = await source.query(statement);
      return rows;
    } finally {
      await source.destroy();
    }
  }
  const schema = async () => sql(`SELECT type, name FROM sqlite_master ORDER BY type, name`);
  const versions = async () =>
    (await sql(`SELECT name FROM sqlite_master WHERE name = 'plugin_storage_migrations_demo'`)).length > 0
      ? (await sql(`SELECT version FROM plugin_storage_migrations_demo`)).map((row) => row.version)
      : [];

  it('refuses to drop a UNIQUE constraint of the adopted table, before anything changes', async () => {
    const head = table(
      { id: f.id(), address: f.string(), state: f.string(), note: f.string().optional() },
      { physicalName: DEVICES },
    );
    const before = await schema();

    await expect(
      runner.migrate(adoptingWith([step.dropIndex('devices', 'UQ_demo_devices_address')], head)),
    ).rejects.toThrow(
      /Migration 2 of plugin "demo" failed and was rolled back: The index "UQ_demo_devices_address" of "demo_devices" is a UNIQUE constraint of the 1\.x table this plugin adopted\. Removing it needs a rebuild/,
    );
    expect(await schema()).toEqual(before);
    expect(await versions()).toEqual([]);
  });

  it.each([
    ['a UNIQUE constraint', 'address', /part of the UNIQUE constraint "sqlite_autoindex_demo_devices_1"/],
    ['a CHECK constraint', 'state', /used by a CHECK constraint of the adopted 1\.x table/],
  ])('refuses to drop a column used by %s, before anything changes', async (_label, column, message) => {
    // Compiled without the declared unique index, so only the database tells the constraint is there.
    const plain = table(
      { id: f.id(), address: f.string(), state: f.string(), note: f.string().optional() },
      { physicalName: DEVICES },
    );
    const fields = { ...plain.fields } as Record<string, unknown>;
    delete fields[column];
    const compiled = compilePluginStorage(
      'demo',
      definePluginStorage({
        tables: { devices: table(fields as never, { physicalName: DEVICES }) },
        migrations: [
          { version: 1, name: 'baseline', steps: [step.createTable('devices', plain)] },
          { version: 2, name: 'drop', steps: [step.dropColumn('devices', column)] },
        ],
        adoption: { legacyMigrations: ['CreateDevices1700000000000'] },
      }),
      { reservedTables: new Set() },
    );
    const before = await sql(`SELECT sql FROM sqlite_master WHERE name = '${DEVICES}'`);

    await expect(runner.migrate(compiled)).rejects.toThrow(message);
    expect(await sql(`SELECT sql FROM sqlite_master WHERE name = '${DEVICES}'`)).toEqual(before);
    expect(await versions()).toEqual([]);
  });

  it('drops a column no constraint uses', async () => {
    const head = table(
      { id: f.id(), address: f.string(), state: f.string() },
      { physicalName: DEVICES, indexes: [{ name: 'UQ_demo_devices_address', fields: ['address'], unique: true }] },
    );
    await runner.migrate(adoptingWith([step.dropColumn('devices', 'note')], head));
    expect(await versions()).toEqual([1, 2]);
  });

  it('refuses to drop an index that belongs to another table', async () => {
    // A 1.x index name that, on this database, is the index of another plugin's table.
    const named = table(
      { id: f.id(), address: f.string(), state: f.string(), note: f.string().optional() },
      { physicalName: DEVICES, indexes: [{ name: 'idx_demo_devices_note', fields: ['note'] }] },
    );
    await sql(
      `DROP INDEX "idx_plugin_other_things_name"`,
      `CREATE INDEX "idx_demo_devices_note" ON "plugin_other_things" ("name")`,
    );
    const compiled = compilePluginStorage(
      'demo',
      definePluginStorage({
        tables: { devices: table(named.fields, { physicalName: DEVICES }) },
        migrations: [
          { version: 1, name: 'baseline', steps: [step.createTable('devices', named)] },
          { version: 2, name: 'drop', steps: [step.dropIndex('devices', 'idx_demo_devices_note')] },
        ],
        adoption: { legacyMigrations: ['CreateDevices1700000000000'] },
      }),
      { reservedTables: new Set() },
    );

    await expect(runner.migrate(compiled)).rejects.toThrow(
      /The index "idx_demo_devices_note" belongs to the table "plugin_other_things", not to "demo_devices"/,
    );
    expect(await sql(`SELECT name FROM sqlite_master WHERE name = 'idx_demo_devices_note'`)).toHaveLength(1);
  });
});

describe('checkConstraints', () => {
  it('reads the bodies of nested CHECK constraints', () => {
    expect(checkConstraints(`CREATE TABLE t (a int, CHECK ((a > 0) AND (a < 9)), b int check(b IN (1)))`)).toEqual([
      '(a > 0) AND (a < 9)',
      'b IN (1)',
    ]);
  });
});

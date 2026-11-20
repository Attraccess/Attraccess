import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import type { DataSource } from 'typeorm';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import type { MigrationTrack } from '../backend/database-backend';
import { SnapshotIncompatibleError, type DatabaseSnapshot, type PluginDescriptor } from '../transfer-snapshot';
import { sqliteStorageDdl } from './plugin-storage/sqlite-storage-ddl';
import { createSqliteTransfer } from './sqlite-transfer';
import { bindDeclaredValue, exportDeclaredValue } from './sqlite-transfer-plugins';

const track: MigrationTrack = { name: 'test-track', tableName: 'migrations', directory: 'none', migrations: [] };
const transfer = createSqliteTransfer(track);

const readings = table({
  id: f.id(),
  price: f.decimal(10, 2),
  day: f.date().optional(),
  takenAt: f.timestamp(),
  ok: f.boolean(),
  meta: f.json().optional(),
  file: f.text().optional(),
});
const storage = definePluginStorage({
  tables: { readings },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('readings', readings)] }],
});
const compiled = compilePluginStorage('@demo/meter', storage, { reservedTables: new Set(['migrations']) });
const plugin: PluginDescriptor = { id: '@demo/meter', version: '2.0.0', storage: compiled };
const READINGS = 'plugin_demo_meter_readings';
const VERSIONS = 'plugin_storage_migrations_demo_meter';

/** A database with the core migration table and the plugin's storage at version 1, as the host creates them. */
async function createDatabase(withRows: boolean): Promise<DataSource> {
  const source = await createTestDataSource();
  await source.query(
    'CREATE TABLE migrations (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, timestamp bigint, name varchar)',
  );
  for (const migration of compiled.migrations) {
    for (const resolved of migration.steps)
      for (const sql of sqliteStorageDdl.statements(resolved)) await source.query(sql);
  }
  await source.query(`CREATE TABLE "${VERSIONS}" ("version" integer PRIMARY KEY NOT NULL, "name" varchar NOT NULL)`);
  await source.query(`INSERT INTO "${VERSIONS}" ("version", "name") VALUES (1, 'baseline')`);
  if (withRows) {
    // The SQLite forms of the plugin storage: a scaled integer decimal, UTC text timestamps, 0/1 booleans.
    await source.query(
      `INSERT INTO "${READINGS}" ("id", "price", "day", "takenAt", "ok", "meta") VALUES
        (1, 1250, '2026-03-02', '2026-03-02 09:00:00.123', 1, '{"a":1}'),
        (2, -5, NULL, '2026-03-03 00:00:00.000', 0, NULL)`,
    );
  }
  return source;
}

describe('SQLite transfer of plugin storage', () => {
  const open: DataSource[] = [];
  const database = async (withRows: boolean) => {
    const source = await createDatabase(withRows);
    open.push(source);
    return source;
  };
  let snapshot: DatabaseSnapshot;

  beforeEach(async () => {
    snapshot = await transfer.exportSnapshot(await database(true), { plugins: [plugin] });
  });

  afterEach(async () => {
    await Promise.all(open.splice(0).map((source) => closeTestDataSource(source)));
  });

  it('types plugin columns by the declaration and exports values in their neutral form', () => {
    const exported = snapshot.tables.find((candidate) => candidate.name === READINGS);
    expect(exported?.columns).toEqual([
      { name: 'id', kind: 'integer' },
      { name: 'price', kind: 'decimal' },
      { name: 'day', kind: 'date' },
      { name: 'takenAt', kind: 'timestamp' },
      { name: 'ok', kind: 'boolean' },
      { name: 'meta', kind: 'text' },
      { name: 'file', kind: 'text' },
    ]);
    expect(exported?.rows).toEqual([
      [1, '12.50', '2026-03-02', '2026-03-02T09:00:00.123Z', true, '{"a":1}', null],
      [2, '-0.05', null, '2026-03-03T00:00:00.000Z', false, null, null],
    ]);
  });

  it('exports the raw bytes 1.x left in a text field as base64, as the record port reads them', async () => {
    const source = await database(true);
    await source.query(`UPDATE "${READINGS}" SET "file" = X'00FF10' WHERE "id" = 1`);
    const exported = (await transfer.exportSnapshot(source, { plugins: [plugin] })).tables.find(
      (candidate) => candidate.name === READINGS,
    );
    expect(exported?.rows[0]?.[6]).toBe(Buffer.from([0, 255, 16]).toString('base64'));
  });

  it('records the storage namespace and versions instead of a 1.x migrations table', () => {
    expect(snapshot.plugins).toEqual([
      { id: '@demo/meter', version: '2.0.0', tables: [READINGS], storage: { namespace: 'demo_meter', versions: [1] } },
    ]);
  });

  it('restores the stored forms of the target declaration', async () => {
    const target = await database(false);
    await transfer.importSnapshot(target, snapshot, { plugins: [plugin] });
    expect(await target.query(`SELECT "price", "day", "ok" FROM "${READINGS}" ORDER BY "id"`)).toEqual([
      { price: 1250, day: '2026-03-02', ok: 1 },
      { price: -5, day: null, ok: 0 },
    ]);
    expect(await transfer.exportSnapshot(target, { plugins: [plugin] })).toEqual(snapshot);
  });

  it('refuses a target without the plugin, or with its storage at another version, before writing anything', async () => {
    const target = await database(false);
    await expect(transfer.importSnapshot(target, snapshot)).rejects.toThrow(/not installed in the target/);
    await target.query(`INSERT INTO "${VERSIONS}" ("version", "name") VALUES (2, 'newer')`);
    await expect(transfer.importSnapshot(target, snapshot, { plugins: [plugin] })).rejects.toThrow(
      /storage of plugin @demo\/meter is at version 2, the snapshot at version 1/,
    );
    expect(await target.query(`SELECT COUNT(*) AS n FROM "${READINGS}"`)).toEqual([{ n: 0 }]);
  });

  it('refuses a target that never migrated the plugin storage', async () => {
    const target = await database(false);
    await target.query(`DROP TABLE "${VERSIONS}"`);
    const stripped = { ...snapshot, tables: snapshot.tables.filter((candidate) => candidate.name !== VERSIONS) };
    await expect(transfer.importSnapshot(target, stripped, { plugins: [plugin] })).rejects.toThrow(
      /is at version none, the snapshot at version 1/,
    );
  });

  it('refuses declared tables that do not exist on export', async () => {
    const source = await database(false);
    await source.query(`DROP TABLE "${READINGS}"`);
    await expect(transfer.exportSnapshot(source, { plugins: [plugin] })).rejects.toThrow(
      /declares tables that do not exist/,
    );
  });

  describe('values', () => {
    const price = compiled.tables.get('readings')?.fields.get('price');

    it.each([
      ['decimal', 12.5, 'real', /is not a decimal/],
      ['date', '2026-03-02 10:00', 'text', /is not a date/],
    ] as const)('refuses a stored %s that is not one', (kind, stored, storageClass, reason) => {
      expect(() => exportDeclaredValue(kind, price, stored, storageClass, 'x')).toThrow(reason);
    });

    it('refuses a decimal column no declaration types', () => {
      expect(() => exportDeclaredValue('decimal', undefined, 1, 'integer', 'x.y')).toThrow(
        /no plugin storage declaration/,
      );
      expect(() => bindDeclaredValue('decimal', undefined, '1.00', 'x.y')).toThrow(SnapshotIncompatibleError);
    });

    it.each([
      ['decimal', 12.5, /is not a decimal/],
      ['decimal', '1.234', /at most 2 fraction digits/],
      ['date', '02.03.2026', /is not a date/],
    ] as const)('refuses a snapshot %s %p that the target cannot store exactly', (kind, value, reason) => {
      expect(() => bindDeclaredValue(kind, price, value, 'x')).toThrow(reason);
    });
  });
});

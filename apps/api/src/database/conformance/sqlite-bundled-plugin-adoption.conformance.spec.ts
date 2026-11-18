import {
  type CompiledPluginStorage,
  PluginStorageMigrationFailed,
  PluginStorageMigrationRefused,
  versionsTableName,
} from '../../plugin-system/plugin-storage/storage-model';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { removeSqlitePortTemplate } from './ports/sqlite-port.test-fixture';
import {
  type BundledPluginStorage,
  BUNDLED_PLUGINS,
  loadBundledPlugins,
} from './plugin-storage/bundled-plugins.test-fixture';
import {
  type LayoutDeviations,
  layoutOf,
  seedLegacyInstallation,
  seedLegacyRows,
  tablesInOrder,
  writeRow,
} from './plugin-storage/legacy-adoption.test-fixture';
import { sqliteStorageFixture } from './plugin-storage/sqlite-plugin-storage.test-fixture';
import type { StorageDatabase } from './plugin-storage/storage-fixture';

jest.setTimeout(120_000);

/**
 * Adoption of the bundled plugins' 1.x tables by the host engine, on real SQLite: each plugin's own storage
 * declaration (bundled from its sources) against the DDL its deleted TypeORM migrations ran (its legacy fixture).
 * The baseline is version 1; later versions of a plugin's history run after the adoption.
 */
describe.each(BUNDLED_PLUGINS)('adoption of the 1.x tables of the bundled plugin %s (sqlite)', (pluginName) => {
  let plugin: BundledPluginStorage;
  let compiled: CompiledPluginStorage;
  /** The release that knows only the baseline: what adoption itself records. */
  let baseline: CompiledPluginStorage;
  let deviations: LayoutDeviations;
  const databases: StorageDatabase[] = [];

  const database = async () => {
    const db = await sqliteStorageFixture.create();
    databases.push(db);
    return db;
  };
  const physicalTables = (storage: CompiledPluginStorage) =>
    [...storage.tables.values()].map((table) => table.physical);

  beforeAll(async () => {
    plugin = (await loadBundledPlugins()).find((candidate) => candidate.name === pluginName) as BundledPluginStorage;
    const db = await database();
    compiled = compilePluginStorage(pluginName, plugin.storage, { reservedTables: db.coreTables() });
    baseline = { ...compiled, migrations: compiled.migrations.slice(0, 1), tables: compiled.migrations[0].schemaAfter };
    deviations = {
      legacyOnlyIndexes: plugin.legacyOnly?.partialUniqueIndexes,
      columnTypes: plugin.legacyOnly?.columnTypeDeviations,
    };
  });

  afterEach(async () => {
    await Promise.all(databases.splice(0).map((db) => db.close()));
  });

  afterAll(removeSqlitePortTemplate);

  it('adopts a complete 1.x history as version 1 without running DDL, and the rows read and write', async () => {
    const versions = versionsTableName(compiled.namespace);
    const db = await database();
    await seedLegacyInstallation(db, plugin);
    const { expected } = await seedLegacyRows(db, compiled);
    const before = await db.snapshot();

    expect(await db.engine.migrate(baseline)).toEqual({ pending: [], adopt: true });

    expect(await db.snapshot({ except: [versions] })).toBe(before);
    expect(await db.committed(`SELECT "version", "source" FROM "${versions}"`)).toEqual([
      { version: 1, source: 'adopted' },
    ]);

    // Later versions of the history (if any) run on top of the adopted tables.
    const later = compiled.migrations.slice(1).map((migration) => migration.version);
    expect(await db.engine.migrate(compiled)).toEqual({ pending: later, adopt: false });

    const side = await db.connect();
    const tables = side.contexts(pluginName, compiled).storage.open(plugin.storage as never) as never as Record<
      string,
      { find(query?: object): Promise<unknown[]>; insert(row: object): Promise<Record<string, unknown>> }
    >;
    for (const [logical, row] of expected)
      expect([logical, await tables[logical].find()]).toEqual([logical, [expect.objectContaining(row)]]);

    // Writes of this release land in the legacy columns; tables with a 1.x CHECK constraint get none (generic values).
    const checked = await db.committed(`SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%CHECK%'`);
    const skip = new Set(checked.map((row) => String(row.name)));
    const written = new Map<string, Record<string, unknown>>(expected);
    let writes = 0;
    for (const table of tablesInOrder(compiled, compiled.tables)) {
      if (skip.has(table.physical)) continue;
      written.set(table.logical, await tables[table.logical].insert(writeRow(table, written)));
      expect(await tables[table.logical].find()).toHaveLength(2);
      writes += 1;
    }
    expect(writes).toBeGreaterThan(0);
  });

  it('refuses a partial 1.x history and changes nothing', async () => {
    const legacy = compiled.legacyMigrations;
    const db = await database();
    await seedLegacyInstallation(db, plugin, legacy.slice(0, -1));
    await seedLegacyRows(db, compiled);
    const before = await db.snapshot();

    // With a single 1.x migration, an empty history is a fresh install: creating the existing tables fails and rolls back.
    const expectedError = legacy.length > 1 ? PluginStorageMigrationRefused : PluginStorageMigrationFailed;
    await expect(db.engine.migrate(compiled)).rejects.toBeInstanceOf(expectedError);
    if (legacy.length > 1) {
      await expect(db.engine.migrate(compiled)).rejects.toThrow(/update to Attraccess 1\.11 and start it once/);
    }

    expect(await db.snapshot()).toBe(before);
  });

  it('creates on a fresh install the layout the 1.x migrations left, and the same head as an adopted install', async () => {
    const legacyDb = await database();
    await seedLegacyInstallation(legacyDb, plugin);
    const freshBaseline = await database();
    await freshBaseline.engine.migrate(baseline);

    const legacyLayout = await layoutOf(legacyDb, physicalTables(baseline), deviations);
    const freshLayout = await layoutOf(freshBaseline, physicalTables(baseline));
    expectEquivalent(freshLayout, legacyLayout);

    await legacyDb.engine.migrate(compiled);
    const fresh = await database();
    await fresh.engine.migrate(compiled);
    expectEquivalent(
      await layoutOf(fresh, physicalTables(compiled)),
      await layoutOf(legacyDb, physicalTables(compiled), deviations),
    );
  });
});

/** Equal layouts, except that a fresh install names the indexes 1.x created as anonymous UNIQUE constraints. */
function expectEquivalent(fresh: Record<string, unknown>, legacy: Record<string, unknown>): void {
  const withoutNames = (layout: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(layout).map(([table, shape]) => [table, { ...(shape as object), namedIndexes: undefined }]),
    );
  expect(withoutNames(fresh)).toEqual(withoutNames(legacy));
  for (const [table, shape] of Object.entries(legacy)) {
    const names = (shape as { namedIndexes: string[] }).namedIndexes;
    expect([table, (fresh[table] as { namedIndexes: string[] }).namedIndexes]).toEqual([
      table,
      expect.arrayContaining(names),
    ]);
  }
}

import { PluginStorageInvalid, definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import {
  PluginStorageDeclarationError,
  PluginStorageMigrationFailed,
  PluginStorageMigrationRefused,
} from '../../../plugin-system/plugin-storage/storage-model';
import { compilePluginStorage } from '../../../plugin-system/plugin-storage/storage-schema';
import { claimStorageNames, releaseStorageNames } from '../../../plugin-system/plugin-storage/storage-registry';
import {
  LEGACY_MIGRATIONS,
  PLUGIN,
  adoptingV1,
  adoptingV3,
  otherStorage,
  storageV1,
  storageV2,
  storageV3,
} from './storage-declarations.test-fixture';
import type { StorageBackendFixture, StorageConnection, StorageDatabase } from './storage-fixture';
import type { CompiledPluginStorage } from '../../../plugin-system/plugin-storage/storage-model';

const ITEMS = 'plugin_conformance_plugin_items';
const NOTES = 'plugin_conformance_plugin_notes';
const VERSIONS = 'plugin_storage_migrations_conformance_plugin';
const LEGACY = 'plugin_migrations_conformance_plugin';

/** The tables a 1.x release of the plugin left behind: TypeORM-style DDL and values, and its migration history. */
async function seedLegacy(db: StorageDatabase, applied: readonly string[] = LEGACY_MIGRATIONS): Promise<void> {
  await db.execute(
    `CREATE TABLE "${ITEMS}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(40) NOT NULL, ` +
      `"qty" integer NOT NULL DEFAULT (0), "price" integer NOT NULL DEFAULT (0), "active" boolean NOT NULL DEFAULT (1), ` +
      `"created" datetime NOT NULL DEFAULT (datetime('now')), "due" date, "meta" text, "ref" varchar(36), ` +
      `"status" varchar(20) NOT NULL DEFAULT ('new'))`,
  );
  await db.execute(`CREATE UNIQUE INDEX "IDX_conformance_plugin_name" ON "${ITEMS}" ("name")`);
  await db.execute(
    `CREATE TABLE "${NOTES}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "itemId" integer NOT NULL, "body" text NOT NULL, ` +
      `FOREIGN KEY ("itemId") REFERENCES "${ITEMS}" ("id") ON DELETE CASCADE)`,
  );
  await db.execute(
    `CREATE TABLE "${LEGACY}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "timestamp" bigint NOT NULL, "name" varchar NOT NULL)`,
  );
  for (const [index, name] of applied.entries()) {
    await db.execute(`INSERT INTO "${LEGACY}" ("timestamp", "name") VALUES (${1700000000000 + index}, '${name}')`);
  }
  await db.execute(
    `INSERT INTO "${ITEMS}" ("name", "qty", "price", "active", "created", "due", "meta", "status") ` +
      `VALUES ('adopted-row', 7, 1250, 0, '2026-03-02 09:00:00.123', '2026-03-02', '{"a":[1,2]}', 'open')`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ItemsApi = { items: Record<string, (...args: any[]) => Promise<any>> };

/** The `items` table of the conformance plugin as a connection serves it. */
function openItems(side: StorageConnection, compiled: CompiledPluginStorage, definition: unknown): ItemsApi {
  return side.contexts(PLUGIN, compiled).storage.open(definition as never) as never as ItemsApi;
}

/**
 * Conformance of the host-owned lifecycle: DDL of every neutral step, migrations (upgrade, failure, rollback),
 * adoption of 1.x tables, uninstall, and the namespacing of every name a plugin declares.
 */
export function describePluginStorageLifecycle(fixture: StorageBackendFixture): void {
  describe(`plugin storage lifecycle (${fixture.name})`, () => {
    let db: StorageDatabase;
    const compile = (definition: Parameters<typeof compilePluginStorage>[1], plugin = PLUGIN) =>
      compilePluginStorage(plugin, definition, { reservedTables: db.coreTables() });

    beforeEach(async () => {
      db = await fixture.create();
    });
    afterEach(() => db.close());

    describe('DDL of the neutral steps and upgrades across releases', () => {
      const columnNames = async (table: string) => (await db.columns(table)).map((column) => column.name).sort();

      it('creates the baseline: tables, keys, required columns and indexes', async () => {
        const plan = await db.engine.migrate(compile(storageV1));

        expect(plan).toEqual({ pending: [1], adopt: false });
        expect(await db.tables()).toEqual(expect.arrayContaining([ITEMS, NOTES, VERSIONS]));
        const items = await db.columns(ITEMS);
        expect(items.find((column) => column.name === 'id')).toMatchObject({ primaryKey: true, required: true });
        expect(items.find((column) => column.name === 'name')?.required).toBe(true);
        expect(items.find((column) => column.name === 'due')?.required).toBe(false);
        expect(await db.indexes(ITEMS)).toEqual(['IDX_conformance_plugin_name']);
      });

      it('upgrades release by release: addColumn, addIndex, data step, renameColumn, createTable, dropTable, dropColumn', async () => {
        await db.engine.migrate(compile(storageV1));
        const side = await db.connect();
        const v1 = side.contexts(PLUGIN, compile(storageV1)).storage.open(storageV1) as never as { items: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
        await v1.items.insert({ name: 'before-upgrade', price: '9.99' });

        await db.engine.migrate(compile(storageV2));
        expect(await columnNames(ITEMS)).toEqual(expect.arrayContaining(['note', 'legacy']));
        expect(await db.indexes(ITEMS)).toEqual(['IDX_conformance_plugin_name', 'IDX_conformance_plugin_status']);
        const v2 = side.contexts(PLUGIN, compile(storageV2)).storage.open(storageV2) as never as { items: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
        // The data step of version 2 ran on the existing row, with the schema of version 2.
        expect(await v2.items.findOne({ where: { name: 'before-upgrade' } })).toMatchObject({
          note: 'backfilled',
          price: '9.99',
        });

        await db.engine.migrate(compile(storageV3));
        const names = await columnNames(ITEMS);
        expect(names).toContain('note');
        expect(names).not.toContain('legacy');
        expect(names).not.toContain('label');
        expect(await db.tables()).not.toContain('plugin_conformance_plugin_scratch');
        const history = await db.engine.assess(compile(storageV3));
        expect(history).toEqual({ pending: [], adopt: false });
      });

      it('applies a whole history in one go on a fresh install, and is idempotent', async () => {
        expect(await db.engine.migrate(compile(storageV3))).toEqual({ pending: [1, 2, 3], adopt: false });
        expect(await db.engine.migrate(compile(storageV3))).toEqual({ pending: [], adopt: false });
      });
    });

    describe('failures roll back and leave nothing behind', () => {
      const failing = (stepSet: 'data' | 'ddl') =>
        definePluginStorage({
          tables: { ...storageV1.tables, ...(stepSet === 'ddl' ? { notes2: table({ id: f.id() }) } : {}) },
          migrations: [
            {
              version: 1,
              name: 'baseline',
              steps: [
                ...(storageV1.migrations[0].steps ?? []),
                ...(stepSet === 'ddl' ? [step.createTable('notes2', table({ id: f.id() }))] : []),
              ],
              data:
                stepSet === 'data'
                  ? async () => {
                      throw new Error('constraint exploded');
                    }
                  : undefined,
            },
          ],
        });

      it('rolls back a failing data step: no table and no history', async () => {
        const before = await db.snapshot();
        await expect(db.engine.migrate(compile(failing('data')))).rejects.toBeInstanceOf(PluginStorageMigrationFailed);
        await expect(db.engine.migrate(compile(failing('data')))).rejects.toThrow(/constraint exploded/);
        expect(await db.snapshot()).toBe(before);
        expect(await db.tables()).not.toContain(VERSIONS);
      });

      it('rolls back a failing step of a later release and keeps the earlier release working', async () => {
        await db.engine.migrate(compile(storageV1));
        const before = await db.snapshot();
        const broken = definePluginStorage({
          tables: storageV2.tables,
          migrations: [
            ...storageV2.migrations.slice(0, 1),
            {
              ...storageV2.migrations[1],
              data: async () => {
                throw new Error('backfill failed');
              },
            },
          ],
        });

        await expect(db.engine.migrate(compile(broken))).rejects.toThrow(
          /Migration 2 of plugin "conformance-plugin" failed/,
        );

        expect(await db.snapshot()).toBe(before);
        expect(await db.engine.assess(compile(storageV1))).toEqual({ pending: [], adopt: false });
      });

      it('rolls back a step that conflicts with an existing table', async () => {
        await db.execute(`CREATE TABLE "plugin_conformance_plugin_notes2" ("id" integer)`);
        const before = await db.snapshot();
        await expect(db.engine.migrate(compile(failing('ddl')))).rejects.toBeInstanceOf(PluginStorageMigrationFailed);
        expect(await db.snapshot()).toBe(before);
      });

      it('refuses a database that is newer than the release, changing nothing', async () => {
        await db.engine.migrate(compile(storageV3));
        const before = await db.snapshot();
        await expect(db.engine.migrate(compile(storageV1))).rejects.toThrow(
          /database is at version 3 but this release only knows up to version 1/,
        );
        await expect(db.engine.assess(compile(storageV1))).rejects.toBeInstanceOf(PluginStorageMigrationRefused);
        expect(await db.snapshot()).toBe(before);
      });
    });

    describe('uninstall', () => {
      it("drops the plugin tables, its history and its legacy history, and no other plugin's", async () => {
        await seedLegacy(db);
        await db.engine.migrate(compile(adoptingV3));
        await db.engine.migrate(compile(otherStorage, 'other-plugin'));

        await db.engine.dropAll(compile(adoptingV3));

        const tables = await db.tables();
        for (const gone of [ITEMS, NOTES, VERSIONS, LEGACY]) expect(tables).not.toContain(gone);
        expect(tables).toContain('plugin_other_plugin_things');
        expect(tables).toContain('plugin_storage_migrations_other_plugin');
        expect([...db.coreTables()].every((core) => tables.includes(core))).toBe(true);
      });

      it('is a no-op for a plugin that never installed, and can run twice', async () => {
        await db.engine.dropAll(compile(storageV3));
        await db.engine.migrate(compile(storageV3));
        await db.engine.dropAll(compile(storageV3));
        await db.engine.dropAll(compile(storageV3));
        expect(await db.tables()).not.toContain(ITEMS);
      });

      it('drops tables created and dropped again by earlier releases without failing', async () => {
        await db.engine.migrate(compile(storageV3));
        await expect(db.engine.dropAll(compile(storageV3))).resolves.toBeUndefined();
      });
    });

    describe('adoption of 1.x tables', () => {
      it('records the baseline without running it: rows stay and read through the record port', async () => {
        await seedLegacy(db);
        const before = await db.snapshot();

        expect(await db.engine.migrate(compile(adoptingV1))).toEqual({ pending: [], adopt: true });

        // Nothing but the version table was added.
        expect((await db.snapshot()).startsWith(before.split('\n')[0])).toBe(true);
        const side = await db.connect();
        const { items } = openItems(side, compile(adoptingV1), adoptingV1);
        expect(await items.findOne({ where: { name: 'adopted-row' } })).toMatchObject({
          qty: 7,
          price: '12.50',
          active: false,
          created: new Date('2026-03-02T09:00:00.123Z'),
          due: '2026-03-02',
          meta: { a: [1, 2] },
          status: 'open',
        });
        // Writes of the new release land in the same legacy-shaped columns.
        const written = await items.insert({ name: 'new-row', created: new Date('2026-04-05T06:07:08.009Z') });
        expect(written.id).toBeGreaterThan(1);
        expect(await db.engine.assess(compile(adoptingV1))).toEqual({ pending: [], adopt: false });
      });

      it('continues with the later versions after adopting, keeping the rows', async () => {
        await seedLegacy(db);

        expect(await db.engine.migrate(compile(adoptingV3))).toEqual({ pending: [2, 3], adopt: true });

        const side = await db.connect();
        const { items } = openItems(side, compile(adoptingV3), adoptingV3);
        expect(await items.findOne({ where: { name: 'adopted-row' } })).toMatchObject({ note: 'backfilled', qty: 7 });
      });

      it('treats an empty legacy history like a fresh install', async () => {
        await db.execute(
          `CREATE TABLE "${LEGACY}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "timestamp" bigint NOT NULL, "name" varchar NOT NULL)`,
        );
        expect(await db.engine.migrate(compile(adoptingV1))).toEqual({ pending: [1], adopt: false });
        expect(await db.tables()).toContain(ITEMS);
      });

      it.each([
        [
          'only some of the 1.x migrations applied',
          LEGACY_MIGRATIONS.slice(0, 1),
          adoptingV1,
          /Install the last 1\.x release of the plugin first/,
        ],
        [
          '1.x migrations this release does not know',
          [...LEGACY_MIGRATIONS, 'SomethingNewer1800000000000'],
          adoptingV1,
          /does not know them/,
        ],
        ['a release that declares no adoption', LEGACY_MIGRATIONS, storageV1, /declares no adoption/],
      ])('refuses a database with %s, changing nothing', async (_label, applied, definition, reason) => {
        await seedLegacy(db, applied);
        const before = await db.snapshot();

        await expect(db.engine.migrate(compile(definition))).rejects.toBeInstanceOf(PluginStorageMigrationRefused);
        await expect(db.engine.migrate(compile(definition))).rejects.toThrow(reason);
        await expect(db.engine.assess(compile(definition))).rejects.toThrow(reason);

        expect(await db.snapshot()).toBe(before);
        expect(await db.tables()).not.toContain(VERSIONS);
      });
    });

    describe('namespacing and validation of declared names', () => {
      it('derives every table name inside the plugin namespace and adopts only names inside it', () => {
        const compiled = compile(storageV3);
        expect([...compiled.tables.values()].map((t) => t.physical)).toEqual([ITEMS, NOTES]);
        const adopted = compile(
          definePluginStorage({
            tables: { legacy: table({ id: f.id() }, { physicalName: 'conformance_plugin_legacy_table' }) },
            migrations: [
              {
                version: 1,
                name: 'b',
                steps: [
                  step.createTable(
                    'legacy',
                    table({ id: f.id() }, { physicalName: 'conformance_plugin_legacy_table' }),
                  ),
                ],
              },
            ],
          }),
        );
        expect(adopted.tables.get('legacy')?.physical).toBe('conformance_plugin_legacy_table');
      });

      const declare = (tableOptions: object, extra: object = {}) =>
        definePluginStorage({
          tables: { t: table({ id: f.id(), name: f.string() }, tableOptions) },
          migrations: [
            {
              version: 1,
              name: 'b',
              steps: [step.createTable('t', table({ id: f.id(), name: f.string() }, tableOptions))],
            },
          ],
          ...extra,
        });

      it.each([
        ['a core table of the host', () => [...db.coreTables()][0]],
        ["another plugin's namespace", () => 'plugin_other_plugin_things'],
        ['a name outside any namespace', () => 'accounts'],
        ['an identifier that is no identifier', () => 'conformance_plugin_x"; DROP TABLE y; --'],
        ['the host migration bookkeeping', () => 'plugin_migrations_conformance_plugin'],
      ])('refuses a physicalName that claims %s', (_label, name) => {
        expect(() => compile(declare({ physicalName: name() }))).toThrow(PluginStorageDeclarationError);
      });

      it.each([
        ['a field name that is not an identifier', { 'a b': f.string() }],
        ['a field named like a filter combinator', { or: f.string() }],
        ['a column that is not an identifier', { name: f.string({ column: 'x"y' }) }],
      ])('refuses %s', (_label, fields) => {
        const bad = (fields_: object) =>
          definePluginStorage({
            tables: { t: table({ id: f.id(), ...fields_ } as never) },
            migrations: [
              { version: 1, name: 'b', steps: [step.createTable('t', table({ id: f.id(), ...fields_ } as never))] },
            ],
          });
        expect(() => compile(bad(fields))).toThrow(PluginStorageDeclarationError);
      });

      it('refuses migrations that do not produce the declared tables, or leave gaps in the versions', () => {
        const t = table({ id: f.id() });
        expect(() => compile(definePluginStorage({ tables: { t }, migrations: [] }))).toThrow(/no migration/);
        expect(() =>
          compile(
            definePluginStorage({
              tables: { t },
              migrations: [{ version: 2, name: 'b', steps: [step.createTable('t', t)] }],
            }),
          ),
        ).toThrow(/version 1/);
        expect(() =>
          compile(
            definePluginStorage({
              tables: { t: table({ id: f.id(), extra: f.text() }) },
              migrations: [{ version: 1, name: 'b', steps: [step.createTable('t', t)] }],
            }),
          ),
        ).toThrow(/do not produce the declared layout/);
        expect(() =>
          compile(
            definePluginStorage({
              tables: {},
              migrations: [{ version: 1, name: 'b', steps: [step.createTable('t', t)] }],
            }),
          ),
        ).toThrow(/not declared in tables/);
      });

      it('refuses foreign keys to tables of another plugin or to the host', () => {
        const child = table(
          { id: f.id(), ref: f.integer() },
          { foreignKeys: [{ fields: ['ref'], references: 'user', referencedFields: ['id'] }] },
        );
        expect(() =>
          compile(
            definePluginStorage({
              tables: { child },
              migrations: [{ version: 1, name: 'b', steps: [step.createTable('child', child)] }],
            }),
          ),
        ).toThrow(/not a table of this plugin/);
      });

      it('lets two plugins live side by side but never claim the same table', () => {
        try {
          claimStorageNames(compile(storageV1, 'conformance-plugin'));
          claimStorageNames(compile(otherStorage, 'other-plugin'));
          // `plugin_a_b_things` is derived for plugin "a" (table "b_things") and for plugin "a-b" (table "things").
          const first = compile(
            definePluginStorage({
              tables: { b_things: table({ id: f.id() }) },
              migrations: [{ version: 1, name: 'b', steps: [step.createTable('b_things', table({ id: f.id() }))] }],
            }),
            'a',
          );
          const clash = compile(
            definePluginStorage({
              tables: { things: table({ id: f.id() }) },
              migrations: [{ version: 1, name: 'b', steps: [step.createTable('things', table({ id: f.id() }))] }],
            }),
            'a-b',
          );
          claimStorageNames(first);
          expect(() => claimStorageNames(clash)).toThrow(/already belongs to plugin "a"/);
        } finally {
          for (const plugin of ['conformance-plugin', 'other-plugin', 'a', 'a-b']) releaseStorageNames(plugin);
        }
      });

      it('serves a plugin only its own definition', async () => {
        const side = await db.connect();
        const mine = side.contexts(PLUGIN, compile(storageV3));
        const none = side.contexts('no-storage', null);
        expect(() => mine.storage.open(storageV3)).not.toThrow();
        expect(() => mine.storage.open(otherStorage)).toThrow(PluginStorageInvalid);
        expect(() => none.storage.open(storageV3)).toThrow(PluginStorageInvalid);
      });

      it('keeps plugins apart in one database: same logical table names, different physical tables', async () => {
        const same = (plugin: string) =>
          compile(
            definePluginStorage({
              tables: { items: table({ id: f.id(), name: f.string() }) },
              migrations: [
                { version: 1, name: 'b', steps: [step.createTable('items', table({ id: f.id(), name: f.string() }))] },
              ],
            }),
            plugin,
          );
        const [a, b] = [same('plug-a'), same('plug-b')];
        await db.engine.migrate(a);
        await db.engine.migrate(b);
        expect(await db.tables()).toEqual(expect.arrayContaining(['plugin_plug_a_items', 'plugin_plug_b_items']));
      });
    });
  });
}

import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import type { PluginStorageMigrationStep } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from './storage-schema';
import { PluginStorageDeclarationError, legacyMigrationsTableOf } from './storage-model';

const options = { reservedTables: new Set<string>(['users']) };
const items = table({ id: f.id(), name: f.string({ length: 40 }) });
const children = table(
  { id: f.id(), itemId: f.integer() },
  { foreignKeys: [{ fields: ['itemId'], references: 'items', referencedFields: ['id'] }] },
);
const baseline = {
  version: 1,
  name: 'baseline',
  steps: [step.createTable('items', items), step.createTable('children', children)],
};

/** The compiled storage of `demo` after the baseline plus `steps`, with `head` as the declared tables. */
const compileSteps = (steps: unknown[], head: Record<string, unknown> = { items, children }) =>
  compilePluginStorage(
    'demo',
    { tables: head, migrations: [baseline, { version: 2, name: 'change', steps }] },
    options,
  );

const rejectSteps = (steps: unknown[], message: RegExp) => {
  expect(() => compileSteps(steps)).toThrow(PluginStorageDeclarationError);
  expect(() => compileSteps(steps)).toThrow(message);
};

describe('applyStep through compilePluginStorage', () => {
  it('resolves every operation against the schema as it stands', () => {
    const statusIndex = { fields: ['status'] };
    const head = {
      items: table(
        { id: f.id(), name: f.string({ length: 40 }), status: f.string().withDefault('new') },
        { indexes: [statusIndex] },
      ),
      scratch: table({ id: f.id(), label: f.text() }),
    };
    const compiled = compileSteps(
      [
        step.addColumn('items', 'legacy', f.string().optional()),
        step.addColumn('items', 'status', f.string().withDefault('new')),
        step.renameColumn('items', 'legacy', 'label'),
        step.dropColumn('items', 'label'),
        step.addIndex('items', statusIndex),
        step.addIndex('items', { fields: ['name'] }),
        step.dropIndex('items', 'idx_plugin_demo_items_name'),
        step.createTable('scratch', table({ id: f.id(), label: f.text() })),
        step.dropTable('children'),
      ],
      head,
    );
    expect(compiled.migrations[1].steps.map((resolved) => resolved.op)).toEqual([
      'addColumn',
      'addColumn',
      'renameColumn',
      'dropColumn',
      'addIndex',
      'addIndex',
      'dropIndex',
      'createTable',
      'dropTable',
    ]);
    const after = compiled.migrations[1].schemaAfter;
    expect([...after.keys()]).toEqual(['items', 'scratch']);
    expect([...(after.get('items')?.fields.keys() ?? [])]).toEqual(['id', 'name', 'status']);
    expect(after.get('items')?.indexes.map((index) => index.name)).toEqual(['idx_plugin_demo_items_status']);
    expect(compiled.ownedTables).toEqual(['plugin_demo_items', 'plugin_demo_children', 'plugin_demo_scratch']);
  });

  it('carries a rename through keys, indexes and foreign keys', () => {
    const head = {
      items: table({ id: f.id(), title: f.string({ length: 40 }) }, { indexes: [{ fields: ['title'] }] }),
      children,
    };
    const compiled = compileSteps(
      [
        // The generated name stays the one of the field it was created on.
        step.addIndex('items', { fields: ['name'] }),
        step.renameColumn('items', 'name', 'title'),
      ],
      head,
    );
    const renamed = compiled.migrations[1].schemaAfter.get('items');
    expect(renamed?.indexes[0].fields).toEqual(['title']);
    expect(renamed?.fields.get('title')).toMatchObject({ name: 'title', column: 'title' });

    const keys = compileSteps(
      [step.renameColumn('items', 'id', 'key'), step.renameColumn('children', 'itemId', 'parent')],
      {
        items: table({ key: f.id(), name: f.string({ length: 40 }) }, { primaryKey: ['key'] }),
        children: table(
          { id: f.id(), parent: f.integer() },
          { foreignKeys: [{ fields: ['parent'], references: 'items', referencedFields: ['key'] }] },
        ),
      },
    );
    expect(keys.migrations[1].schemaAfter.get('items')?.primaryKey).toEqual(['key']);
    // The engine rewrites the referencing table's definition; the compiled key follows the renamed parent field.
    expect(keys.migrations[1].schemaAfter.get('children')?.foreignKeys[0]).toMatchObject({
      fields: ['parent'],
      referencedFields: ['key'],
      referencedColumns: ['key'],
    });
  });

  it('reads an adopted physical name from the step or the head declaration', () => {
    const adopted = table({ id: f.id() }, { physicalName: 'plugin_demo_legacy' });
    const adoption = { legacyMigrations: ['CreateLegacy1700000000000'] };
    const compiled = compilePluginStorage(
      'demo',
      {
        tables: { adopted },
        migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('adopted', adopted)] }],
        adoption,
      },
      options,
    );
    expect(compiled.tables.get('adopted')?.physical).toBe('plugin_demo_legacy');

    const fromHead = compilePluginStorage(
      'demo',
      {
        tables: { adopted },
        migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('adopted', table({ id: f.id() }))] }],
        adoption,
      },
      options,
    );
    expect(fromHead.migrations[0].steps[0]).toMatchObject({ table: { physical: 'plugin_demo_legacy' } });
  });

  it('adopts 1.x names of the legacy namespace when the package name derives another one', () => {
    const legacy = table(
      { id: f.id(), ip: f.string() },
      {
        physicalName: 'plugin_shelly_devices',
        indexes: [{ name: 'UQ_plugin_shelly_devices_ip', fields: ['ip'], unique: true }],
      },
    );
    const definition = (adoption: Record<string, unknown>) => ({
      tables: { devices: legacy },
      migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('devices', legacy)] }],
      adoption: { legacyMigrations: ['CreateDevices1700000000000'], ...adoption },
    });
    const name = '@attraccess/plugin-shelly';

    expect(() => compilePluginStorage(name, definition({}), options)).toThrow(
      /physicalName "plugin_shelly_devices" must start with "plugin_attraccess_plugin_shelly_" or "attraccess_plugin_shelly_"/,
    );
    const compiled = compilePluginStorage(name, definition({ namespace: 'shelly' }), options);
    expect(compiled.tables.get('devices')?.physical).toBe('plugin_shelly_devices');
    expect(legacyMigrationsTableOf(compiled)).toBe('plugin_migrations_shelly');
    expect(legacyMigrationsTableOf(compilePluginStorage('shelly', definition({}), options))).toBe(
      'plugin_migrations_shelly',
    );
    expect(() => compilePluginStorage(name, definition({ namespace: 'Bad Name' }), options)).toThrow(
      /adoption.namespace must be a lowercase identifier/,
    );
    expect(() => compilePluginStorage('@someone/plugin-shelly', definition({ namespace: 'shelly' }), options)).toThrow(
      /adoption.namespace "shelly" is only allowed for the plugin "shelly" or its npm package "@attraccess\/plugin-shelly"/,
    );
  });

  it('rejects a step that is no object and an operation it does not know', () => {
    rejectSteps(['createTable'], /migration 2 step 1 is not a step/);
    rejectSteps([null], /is not a step/);
    rejectSteps([{ op: 'truncate', table: 'items' }], /migration 2 step 1 has the unknown operation "truncate"/);
    rejectSteps([{}], /has the unknown operation "undefined"/);
  });

  describe('createTable', () => {
    it('rejects an existing or malformed table name', () => {
      rejectSteps([step.createTable('items', items)], /migration 2 step 1: table "items" exists/);
      rejectSteps([{ op: 'createTable', table: 7, definition: items }], /table "7" exists/);
    });

    it('rejects a definition that is no table', () => {
      rejectSteps(
        [{ op: 'createTable', table: 'more', definition: 'nope' }],
        /table "more" must be built with table\(\)/,
      );
    });

    it('lets a new table reference tables that exist when the step runs', () => {
      const more = table(
        { id: f.id(), itemId: f.integer() },
        { foreignKeys: [{ fields: ['itemId'], references: 'items', referencedFields: ['id'] }] },
      );
      expect(compileSteps([step.createTable('more', more)], { items, children, more }).tables.has('more')).toBe(true);
      rejectSteps(
        [
          step.createTable(
            'more',
            table({ id: f.id() }, { foreignKeys: [{ fields: ['id'], references: 'later', referencedFields: ['id'] }] }),
          ),
        ],
        /references "later", which is not a table of this plugin/,
      );
    });
  });

  describe('dropTable', () => {
    it('rejects an unknown table', () => {
      rejectSteps([step.dropTable('ghosts')], /migration 2 step 1: unknown table "ghosts"/);
      rejectSteps([{ op: 'dropTable', table: 3 }], /unknown table "3"/);
    });

    it('rejects a table another table still references', () => {
      rejectSteps([step.dropTable('items')], /table "children" still references "items"/);
    });
  });

  describe('addColumn', () => {
    it('rejects an existing field and an unknown table', () => {
      rejectSteps([step.addColumn('items', 'name', f.text().optional())], /field "items.name" exists/);
      rejectSteps([step.addColumn('ghosts', 'x', f.text().optional())], /unknown table "ghosts"/);
    });

    it('rejects a definition that is no field', () => {
      rejectSteps([{ op: 'addColumn', table: 'items', field: 'x', definition: 'text' }], /must be built with the f/);
    });

    it('rejects a generated field', () => {
      rejectSteps(
        [step.addColumn('items', 'key', f.uuidId())],
        /a generated field cannot be added to an existing table/,
      );
    });

    it('rejects a required field without default', () => {
      rejectSteps([step.addColumn('items', 'x', f.text())], /adding the required field "x" needs a default/);
    });

    it('rejects a column that defaults to now', () => {
      rejectSteps(
        [step.addColumn('items', 'at', f.timestamp().withDefault({ now: true }))],
        /an added column cannot default to now/,
      );
    });

    it('rejects a column that is already taken', () => {
      rejectSteps([step.addColumn('items', 'other', f.text({ column: 'name' }).optional())], /column "name" exists/);
    });
  });

  describe('dropColumn', () => {
    it('rejects unknown fields', () => {
      rejectSteps([step.dropColumn('items', 'ghost')], /unknown field "items.ghost"/);
    });

    it('rejects fields that are part of a key, an index or a foreign key', () => {
      rejectSteps([step.dropColumn('items', 'id')], /field "id" is part of a key or index; drop that first/);
      rejectSteps([step.dropColumn('children', 'itemId')], /field "itemId" is part of a key or index/);
      rejectSteps(
        [step.addIndex('items', { fields: ['name'] }), step.dropColumn('items', 'name')],
        /field "name" is part of a key or index/,
      );
    });
  });

  describe('renameColumn', () => {
    it('rejects unknown and clashing fields', () => {
      rejectSteps([step.renameColumn('items', 'ghost', 'x')], /unknown field "items.ghost"/);
      rejectSteps([step.renameColumn('items', 'name', 'id')], /field "id" exists/);
    });

    it('rejects a new name that is not allowed', () => {
      rejectSteps([step.renameColumn('items', 'name', 'not')], /field name "items.not" is not allowed/);
    });
  });

  describe('addIndex', () => {
    it('rejects an unknown field, a clashing name and an unknown table', () => {
      rejectSteps([step.addIndex('items', { fields: ['ghost'] })], /names the unknown field "ghost"/);
      rejectSteps(
        [step.addIndex('items', { fields: ['name'] }), step.addIndex('items', { fields: ['name'] })],
        /index "idx_plugin_demo_items_name" exists/,
      );
      rejectSteps([step.addIndex('ghosts', { fields: ['name'] })], /unknown table "ghosts"/);
    });
  });

  describe('dropIndex', () => {
    it('rejects an unknown index', () => {
      rejectSteps([step.dropIndex('items', 'IDX_demo_missing')], /unknown index "IDX_demo_missing" on "items"/);
      rejectSteps([{ op: 'dropIndex', table: 'items' } as PluginStorageMigrationStep], /unknown index "undefined"/);
    });
  });
});

describe('compilePluginStorage', () => {
  const valid = definePluginStorage({
    tables: { items },
    migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('items', items)] }],
  });

  it('compiles a declaration into tables, migrations and owned tables', () => {
    const compiled = compilePluginStorage('Demo Plugin', valid, options);
    expect(compiled).toMatchObject({
      pluginName: 'Demo Plugin',
      namespace: 'demo_plugin',
      legacyMigrations: [],
      ownedTables: ['plugin_demo_plugin_items'],
    });
    expect(compiled.definition).toBe(valid);
    expect(compiled.migrations).toHaveLength(1);
  });

  it.each([
    ['no declaration', undefined, /use definePluginStorage/],
    ['no tables', { migrations: [] }, /use definePluginStorage/],
    [
      'tables without a migration',
      { tables: { items }, migrations: [] },
      /tables are declared but there is no migration/,
    ],
    ['migrations that are no list', { tables: {}, migrations: 'x' }, /migrations must be a list/],
    ['a migration that is no object', { tables: {}, migrations: [1] }, /migration #1 is malformed/],
    ['a version gap', { tables: {}, migrations: [{ version: 2, name: 'n' }] }, /must have version 1/],
    ['a nameless migration', { tables: {}, migrations: [{ version: 1, name: '' }] }, /migration 1 needs a name/],
    [
      'a data step that is no function',
      { tables: {}, migrations: [{ version: 1, name: 'n', data: 1 }] },
      /data must be a function/,
    ],
    [
      'steps that are no list',
      { tables: {}, migrations: [{ version: 1, name: 'n', steps: 1 }] },
      /steps must be a list/,
    ],
    [
      'too many steps',
      { tables: {}, migrations: [{ version: 1, name: 'n', steps: new Array(201).fill(step.dropTable('x')) }] },
      /at most 200 steps/,
    ],
    [
      'too many migrations',
      { tables: {}, migrations: new Array(501).fill({ version: 1, name: 'n' }) },
      /at most 500 migrations/,
    ],
    [
      'two tables on one physical name',
      {
        tables: {
          a: table({ id: f.id() }, { physicalName: 'demo_x' }),
          b: table({ id: f.id() }, { physicalName: 'DEMO_X' }),
        },
        migrations: [],
        adoption: { legacyMigrations: ['CreateX1700000000000'] },
      },
      /two tables map to "DEMO_X"/,
    ],
    [
      'a declared table no migration creates',
      { tables: { items, other: table({ id: f.id() }) }, migrations: valid.migrations },
      /table "other" is declared but no migration creates it/,
    ],
    [
      'a migrated table that is not declared',
      { tables: {}, migrations: valid.migrations },
      /migrations leave the table "items" that is not declared in tables/,
    ],
    [
      'a layout the migrations do not produce',
      { tables: { items: table({ id: f.id(), name: f.text() }) }, migrations: valid.migrations },
      /the migrations do not produce the declared layout/,
    ],
    [
      'adoption without names',
      { ...valid, adoption: { legacyMigrations: [] } },
      /adoption.legacyMigrations must list the class names/,
    ],
    ['adoption that is no object', { ...valid, adoption: 'x' }, /adoption.legacyMigrations must list/],
    ['adoption with a bad name', { ...valid, adoption: { legacyMigrations: ['1bad'] } }, /must list the class names/],
    ['adoption listing a name twice', { ...valid, adoption: { legacyMigrations: ['A1', 'A1'] } }, /lists a name twice/],
  ])('rejects %s', (_label, definition, message) => {
    expect(() => compilePluginStorage('demo', definition, options)).toThrow(PluginStorageDeclarationError);
    expect(() => compilePluginStorage('demo', definition, options)).toThrow(message);
  });

  it('reads the legacy migrations of an adopted plugin', () => {
    const adopting = { ...valid, adoption: { legacyMigrations: ['CreateItems1700000000000'] } };
    expect(compilePluginStorage('demo', adopting, options).legacyMigrations).toEqual(['CreateItems1700000000000']);
  });

  it('accepts a plugin without tables and migrations', () => {
    expect(compilePluginStorage('demo', { tables: {}, migrations: [] }, options).ownedTables).toEqual([]);
  });

  it('runs a migration that has a data step and no steps', () => {
    const data = async () => undefined;
    const compiled = compilePluginStorage(
      'demo',
      { tables: { items }, migrations: [...valid.migrations, { version: 2, name: 'backfill', data }] },
      options,
    );
    expect(compiled.migrations[1]).toMatchObject({ version: 2, steps: [], data });
  });
});

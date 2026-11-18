import { f, step, table, type PluginStorageMigrationStep } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from '../../../plugin-system/plugin-storage/storage-schema';
import { sqliteStorageDdl } from './sqlite-storage-ddl';

const options = { reservedTables: new Set<string>() };

/** The statements of the steps of a plugin whose first migration creates `tables` and whose second applies `steps`. */
function statementsOf(
  tables: Record<string, ReturnType<typeof table>>,
  steps: PluginStorageMigrationStep[] = [],
  head: Record<string, ReturnType<typeof table>> = tables,
): string[][] {
  const compiled = compilePluginStorage(
    'demo',
    {
      tables: head,
      migrations: [
        {
          version: 1,
          name: 'baseline',
          steps: Object.entries(tables).map(([name, def]) => step.createTable(name, def)),
        },
        ...(steps.length > 0 ? [{ version: 2, name: 'change', steps }] : []),
      ],
    },
    options,
  );
  return compiled.migrations
    .flatMap((migration) => migration.steps)
    .map((resolved) => sqliteStorageDdl.statements(resolved));
}

describe('sqliteStorageDdl', () => {
  it('creates a table with every field type, defaults, keys, indexes and foreign keys', () => {
    const parents = table({ id: f.id() });
    const items = table(
      {
        id: f.id(),
        name: f.string({ length: 40 }),
        label: f.string().optional(),
        ref: f.uuid().optional(),
        body: f.text().optional(),
        meta: f.json().optional(),
        qty: f.integer().withDefault(0),
        price: f.decimal(10, 2).withDefault('12.50'),
        active: f.boolean().withDefault(true),
        off: f.boolean().withDefault(false),
        created: f.timestamp().withDefault({ now: true }),
        seen: f.timestamp().withDefault('2026-01-02T03:04:05.006Z'),
        due: f.date().withDefault('2026-02-03'),
        note: f.string().withDefault("it's"),
        gone: f.integer().optional().withDefault(null),
        parentId: f.integer().optional(),
        config: f.json().withDefault('{"a":1}'),
      },
      {
        indexes: [{ fields: ['name'], unique: true }, { fields: ['qty', 'name'] }],
        foreignKeys: [{ fields: ['parentId'], references: 'parents', referencedFields: ['id'], onDelete: 'set-null' }],
      },
    );
    const [, [create, ...indexes]] = statementsOf({ parents, items });
    expect(create).toBe(
      'CREATE TABLE "plugin_demo_items" (' +
        '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ' +
        '"name" varchar(40) NOT NULL, ' +
        '"label" varchar(255), ' +
        '"ref" varchar(36), ' +
        '"body" text, ' +
        '"meta" text, ' +
        `"qty" integer NOT NULL DEFAULT 0, ` +
        `"price" integer NOT NULL DEFAULT 1250, ` +
        `"active" boolean NOT NULL DEFAULT 1, ` +
        `"off" boolean NOT NULL DEFAULT 0, ` +
        `"created" datetime NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')), ` +
        `"seen" datetime NOT NULL DEFAULT '2026-01-02 03:04:05.006', ` +
        `"due" date NOT NULL DEFAULT '2026-02-03', ` +
        `"note" varchar(255) NOT NULL DEFAULT 'it''s', ` +
        '"gone" integer DEFAULT NULL, ' +
        '"parentId" integer, ' +
        `"config" text NOT NULL DEFAULT '{"a":1}', ` +
        'FOREIGN KEY ("parentId") REFERENCES "plugin_demo_parents" ("id") ON DELETE SET NULL)',
    );
    expect(indexes).toEqual([
      'CREATE UNIQUE INDEX "uq_plugin_demo_items_name" ON "plugin_demo_items" ("name")',
      'CREATE INDEX "idx_plugin_demo_items_qty_name" ON "plugin_demo_items" ("qty", "name")',
    ]);
  });

  it('uses a table constraint for the key unless one generated integer is the key', () => {
    const [[composite], [uuidKeyed]] = statementsOf({
      pairs: table({ a: f.string(), b: f.integer() }, { primaryKey: ['a', 'b'] }),
      uuids: table({ id: f.uuidId() }),
    });
    expect(composite).toBe(
      'CREATE TABLE "plugin_demo_pairs" ("a" varchar(255) NOT NULL, "b" integer NOT NULL, PRIMARY KEY ("a", "b"))',
    );
    expect(uuidKeyed).toBe('CREATE TABLE "plugin_demo_uuids" ("id" varchar(36) NOT NULL, PRIMARY KEY ("id"))');
  });

  it('spells out each foreign key action', () => {
    const parents = table({ id: f.id() });
    const child = (onDelete?: 'cascade' | 'restrict' | 'set-null') =>
      table(
        { id: f.id(), parentId: f.integer() },
        { foreignKeys: [{ fields: ['parentId'], references: 'parents', referencedFields: ['id'], onDelete }] },
      );
    const sqlOf = (onDelete?: 'cascade' | 'restrict' | 'set-null') =>
      statementsOf({ parents, children: child(onDelete) })[1][0];
    expect(sqlOf()).toMatch(/REFERENCES "plugin_demo_parents" \("id"\)\)$/);
    expect(sqlOf('cascade')).toMatch(/\("id"\) ON DELETE CASCADE\)$/);
    expect(sqlOf('restrict')).toMatch(/\("id"\) ON DELETE RESTRICT\)$/);
    expect(sqlOf('set-null')).toMatch(/\("id"\) ON DELETE SET NULL\)$/);
  });

  it('builds the statements of every other step', () => {
    const items = table({ id: f.id(), name: f.string() });
    const head = {
      items: table(
        { id: f.id(), name: f.string(), extra: f.integer().withDefault(5) },
        { indexes: [{ fields: ['name'] }] },
      ),
    };
    const statements = statementsOf(
      { items },
      [
        step.addColumn('items', 'extra', f.integer().withDefault(5)),
        step.addColumn('items', 'tmp', f.text().optional()),
        step.renameColumn('items', 'tmp', 'renamed'),
        step.dropColumn('items', 'renamed'),
        step.addIndex('items', { fields: ['name'] }),
        step.addIndex('items', { fields: ['extra'], unique: true }),
        step.dropIndex('items', 'uq_plugin_demo_items_extra'),
        step.createTable('scratch', table({ id: f.id() })),
        step.dropTable('scratch'),
      ],
      head,
    ).slice(1);
    expect(statements).toEqual([
      ['ALTER TABLE "plugin_demo_items" ADD COLUMN "extra" integer NOT NULL DEFAULT 5'],
      ['ALTER TABLE "plugin_demo_items" ADD COLUMN "tmp" text'],
      ['ALTER TABLE "plugin_demo_items" RENAME COLUMN "tmp" TO "renamed"'],
      ['ALTER TABLE "plugin_demo_items" DROP COLUMN "renamed"'],
      ['CREATE INDEX "idx_plugin_demo_items_name" ON "plugin_demo_items" ("name")'],
      ['CREATE UNIQUE INDEX "uq_plugin_demo_items_extra" ON "plugin_demo_items" ("extra")'],
      ['DROP INDEX "uq_plugin_demo_items_extra"'],
      ['CREATE TABLE "plugin_demo_scratch" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)'],
      ['DROP TABLE "plugin_demo_scratch"'],
    ]);
  });

  it('references the physical columns of a parent key whose fields map to other columns', () => {
    const parents = table(
      { id: f.id({ column: 'parent_pk' }), code: f.string({ column: 'parent_code' }) },
      { indexes: [{ fields: ['code'], unique: true }] },
    );
    const children = table(
      { id: f.id(), parentId: f.integer(), parentCode: f.string() },
      {
        foreignKeys: [
          { fields: ['parentId'], references: 'parents', referencedFields: ['id'] },
          { fields: ['parentCode'], references: 'parents', referencedFields: ['code'] },
        ],
      },
    );
    const [, [create]] = statementsOf({ parents, children });
    expect(create).toContain('FOREIGN KEY ("parentId") REFERENCES "plugin_demo_parents" ("parent_pk")');
    expect(create).toContain('FOREIGN KEY ("parentCode") REFERENCES "plugin_demo_parents" ("parent_code")');
  });

  it('uses the physical column of an adopted field', () => {
    const [[create]] = statementsOf({ items: table({ id: f.id(), name: f.string({ column: 'title' }) }) });
    expect(create).toContain('"title" varchar(255) NOT NULL');
  });
});

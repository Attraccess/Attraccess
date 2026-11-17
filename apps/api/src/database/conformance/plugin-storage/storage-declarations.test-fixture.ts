import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';

/**
 * The storage declarations of the conformance plugin. `itemsV1` is the layout the first release creates;
 * `itemsV3` is the head after two more migrations, which together cover every neutral step.
 */
export const PLUGIN = 'conformance-plugin';

export const itemsV1 = table(
  {
    id: f.id(),
    name: f.string({ length: 40 }),
    qty: f.integer().withDefault(0),
    price: f.decimal(10, 2).withDefault('0.00'),
    active: f.boolean().withDefault(true),
    created: f.timestamp().withDefault({ now: true }),
    due: f.date().optional(),
    meta: f.json().optional(),
    ref: f.uuid().optional(),
    status: f.string({ length: 20 }).withDefault('new'),
  },
  { indexes: [{ name: 'IDX_conformance_plugin_name', fields: ['name'], unique: true }] },
);

export const notes = table(
  { id: f.id(), itemId: f.integer(), body: f.text() },
  { foreignKeys: [{ fields: ['itemId'], references: 'items', referencedFields: ['id'], onDelete: 'cascade' }] },
);

export const baselineMigration = {
  version: 1,
  name: 'baseline',
  steps: [step.createTable('items', itemsV1), step.createTable('notes', notes)],
};

export const storageV1 = definePluginStorage({
  tables: { items: itemsV1, notes },
  migrations: [baselineMigration],
});

const statusIndex = { name: 'IDX_conformance_plugin_status', fields: ['status'] };

export const itemsV2 = table(
  { ...itemsV1.fields, note: f.text().optional(), legacy: f.string().optional() },
  { indexes: [...itemsV1.indexes, { name: 'IDX_conformance_plugin_status', fields: ['status'] }] },
);

/** Head of the full history: `note` added, `legacy` added then renamed then dropped, a scratch table created and dropped. */
export const itemsV3 = table(
  { ...itemsV1.fields, note: f.text().optional() },
  { indexes: [...itemsV1.indexes, statusIndex] },
);

export const noteMigration = {
  version: 2,
  name: 'note-and-status-index',
  steps: [
    step.addColumn('items', 'note', f.text().optional()),
    step.addColumn('items', 'legacy', f.string().optional()),
    step.addIndex('items', statusIndex),
  ],
  data: async ({ tables }: { tables: unknown }) => {
    const api = tables as Record<string, { update(where: unknown, patch: unknown): Promise<number> }>;
    await api.items.update({ note: null }, { note: 'backfilled' });
  },
};

export const scratchMigration = {
  version: 3,
  name: 'rename-drop-scratch',
  steps: [
    step.renameColumn('items', 'legacy', 'label'),
    step.createTable('scratch', table({ id: f.id() })),
    step.dropTable('scratch'),
    step.dropColumn('items', 'label'),
  ],
};

export const storageV2 = definePluginStorage({
  tables: { items: itemsV2, notes },
  migrations: [baselineMigration, noteMigration],
});

export const storageV3 = definePluginStorage({
  tables: { items: itemsV3, notes },
  migrations: [baselineMigration, noteMigration, scratchMigration],
});

/** The 1.x release's migration class names, as the adopting release lists them. */
export const LEGACY_MIGRATIONS = ['CreateItems1700000000000', 'CreateNotes1700000001000'];

export const adoptingV1 = definePluginStorage({
  tables: { items: itemsV1, notes },
  migrations: [baselineMigration],
  adoption: { legacyMigrations: LEGACY_MIGRATIONS },
});

export const adoptingV3 = definePluginStorage({
  tables: { items: itemsV3, notes },
  migrations: [baselineMigration, noteMigration, scratchMigration],
  adoption: { legacyMigrations: LEGACY_MIGRATIONS },
});

/** A second plugin: its names must never meet the first one's. */
export const otherStorage = definePluginStorage({
  tables: { things: table({ id: f.id(), name: f.string() }) },
  migrations: [
    { version: 1, name: 'baseline', steps: [step.createTable('things', table({ id: f.id(), name: f.string() }))] },
  ],
});

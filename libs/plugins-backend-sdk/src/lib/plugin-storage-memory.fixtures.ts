import { definePluginStorage, f, step, table } from './plugin-storage';

export const parents = table(
  { id: f.id(), name: f.string(), kind: f.string().optional() },
  { indexes: [{ name: 'parents_name', fields: ['name'], unique: true }] },
);

export const children = table(
  { id: f.uuidId(), parentId: f.integer().optional(), label: f.string({ length: 5 }) },
  { foreignKeys: [{ fields: ['parentId'], references: 'parents', referencedFields: ['id'], onDelete: 'cascade' }] },
);

export const items = table(
  {
    id: f.id(),
    name: f.string(),
    sku: f.string().optional(),
    qty: f.integer().withDefault(0),
    price: f.decimal(8, 2).optional(),
    active: f.boolean().withDefault(true),
    day: f.date().optional(),
    meta: f.json().optional(),
    createdAt: f.timestamp().withDefault({ now: true }),
    seenAt: f.timestamp().optional(),
  },
  { indexes: [{ fields: ['sku'], unique: true }] },
);

export const links = table({ a: f.integer(), b: f.integer(), note: f.text().optional() }, { primaryKey: ['a', 'b'] });

export const guarded = table(
  { id: f.id(), parentId: f.integer() },
  { foreignKeys: [{ fields: ['parentId'], references: 'parents', referencedFields: ['id'] }] },
);

export const nullable = table(
  { id: f.id(), parentId: f.integer().optional() },
  { foreignKeys: [{ fields: ['parentId'], references: 'parents', referencedFields: ['id'], onDelete: 'set-null' }] },
);

export const storage = definePluginStorage({
  tables: { parents, children, items, links, guarded, nullable },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('items', items)] }],
});

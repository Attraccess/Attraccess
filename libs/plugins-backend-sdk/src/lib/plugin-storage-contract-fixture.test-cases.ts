import type { PluginPersistenceContext } from './plugin-persistence';
import { definePluginStorage, f, step, table, type PluginStorageDefinition } from './plugin-storage';

/** The declarations and types of the plugin storage contract suite (see plugin-storage-contract.test-cases.ts). */

export const contractItems = table(
  {
    id: f.id(),
    name: f.string({ length: 40 }),
    qty: f.integer().withDefault(0),
    score: f.integer().optional(),
    price: f.decimal(10, 2).withDefault('0.00'),
    active: f.boolean().withDefault(true),
    created: f.timestamp().withDefault({ now: true }),
    due: f.date().optional(),
    meta: f.json().optional(),
    ref: f.uuid().optional(),
    status: f.string({ length: 20 }).withDefault('new'),
    note: f.text().optional(),
  },
  { indexes: [{ fields: ['name'], unique: true }, { fields: ['status'] }] },
);

export const contractNotes = table(
  { id: f.id(), itemId: f.integer(), body: f.text() },
  { foreignKeys: [{ fields: ['itemId'], references: 'items', referencedFields: ['id'], onDelete: 'cascade' }] },
);

export const contractPairs = table(
  { a: f.string(), b: f.integer(), label: f.string().optional() },
  { primaryKey: ['a', 'b'] },
);

/** The storage of the contract plugin. A host migrates it under its own plugin name before the suite runs. */
export const contractStorage = definePluginStorage({
  tables: { items: contractItems, notes: contractNotes, pairs: contractPairs },
  migrations: [
    {
      version: 1,
      name: 'baseline',
      steps: [
        step.createTable('items', contractItems),
        step.createTable('notes', contractNotes),
        step.createTable('pairs', contractPairs),
      ],
    },
  ],
});

/**
 * The tables are typed loosely: the cases also pass values the types forbid, to see them refused at run time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContractTable = any;

/** One caller of the storage: its record port and its transaction capability. */
export interface StorageContractSide {
  readonly persistence: PluginPersistenceContext;
  readonly items: ContractTable;
  readonly notes: ContractTable;
  readonly pairs: ContractTable;
}

export interface StorageContractBackend {
  /** A caller of the storage under test. On a host it is a new independent connection; a fake has just one. */
  open(): Promise<StorageContractSide>;
  close(): Promise<void>;
}

/** Creates the backend with `definition` installed (migrated, on a host) and empty. */
export type StorageContractFactory = (definition: PluginStorageDefinition) => Promise<StorageContractBackend>;

export type OpenSide = () => Promise<StorageContractSide>;

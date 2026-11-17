// Typed access to the Matter plugin's own tables through the record port (`context.storage`).
//
// `matterStorage(context)` gives the narrowed table APIs and a `transaction` that binds the transaction scope to every
// call, so a service writes `tables.nodes.update(...)` inside `transaction((tables) => ...)` without passing the scope
// around. The row types narrow the declared string columns (`LifecycleState`, ...); the declaration in `tables.ts`
// stays the single source of the layout.
import type {
  PluginContext,
  PluginStorageCallOptions,
  PluginStoragePatch,
  PluginStorageQuery,
  PluginStorageWhere,
  PluginTransactionScope,
} from '@attraccess/plugins-backend-sdk';
import type { MatterBackup, MatterRecoveryKey } from '../backup/entities';
import type { MatterConnection } from '../connection/entity';
import type {
  MatterCommand,
  MatterEndpoint,
  MatterEndpointCapability,
  MatterEndpointCluster,
  MatterEndpointState,
  MatterFabric,
  MatterNode,
  MatterReconciliationStatus,
} from '../devices/entities';
import { MATTER_STORAGE } from './tables';

type FieldName<Row> = keyof Row & string;

/** One table of the record port, typed with the plugin's narrowed row. Every method also takes `{ scope }`. */
export interface MatterTable<Row> {
  insert(row: Row, options?: PluginStorageCallOptions): Promise<Row>;
  insertMany(rows: readonly Row[], options?: PluginStorageCallOptions): Promise<Row[]>;
  /** By primary key. */
  get(key: string | number, options?: PluginStorageCallOptions): Promise<Row | null>;
  find(query?: PluginStorageQuery<Row>, options?: PluginStorageCallOptions): Promise<Row[]>;
  findOne(query?: PluginStorageQuery<Row>, options?: PluginStorageCallOptions): Promise<Row | null>;
  count(where?: PluginStorageWhere<Row>, options?: PluginStorageCallOptions): Promise<number>;
  /** Atomic compare-and-set: the number of rows that matched `where` and were changed. */
  update(
    where: PluginStorageWhere<Row>,
    patch: PluginStoragePatch<Row>,
    options?: PluginStorageCallOptions,
  ): Promise<number>;
  delete(where: PluginStorageWhere<Row>, options?: PluginStorageCallOptions): Promise<number>;
  upsert(
    row: Row,
    options: PluginStorageCallOptions & { conflictOn: readonly FieldName<Row>[]; update?: readonly FieldName<Row>[] },
  ): Promise<Row>;
}

export interface MatterTables {
  connection: MatterTable<MatterConnection>;
  fabrics: MatterTable<MatterFabric>;
  nodes: MatterTable<MatterNode>;
  endpoints: MatterTable<MatterEndpoint>;
  endpointClusters: MatterTable<MatterEndpointCluster>;
  endpointCapabilities: MatterTable<MatterEndpointCapability>;
  endpointState: MatterTable<MatterEndpointState>;
  commands: MatterTable<MatterCommand>;
  reconciliationStatus: MatterTable<MatterReconciliationStatus>;
  recoveryKeys: MatterTable<MatterRecoveryKey>;
  backups: MatterTable<MatterBackup>;
}

type Table = MatterTable<Record<string, unknown>>;

function bindTable(api: Table, scope: PluginTransactionScope): Table {
  return {
    insert: (row) => api.insert(row, { scope }),
    insertMany: (rows) => api.insertMany(rows, { scope }),
    get: (key) => api.get(key, { scope }),
    find: (query) => api.find(query, { scope }),
    findOne: (query) => api.findOne(query, { scope }),
    count: (where) => api.count(where, { scope }),
    update: (where, patch) => api.update(where, patch, { scope }),
    delete: (where) => api.delete(where, { scope }),
    upsert: (row, options) => api.upsert(row, { ...options, scope }),
  };
}

function bindTables(tables: MatterTables, scope: PluginTransactionScope): MatterTables {
  return Object.fromEntries(
    Object.entries(tables).map(([name, api]) => [name, bindTable(api as unknown as Table, scope)]),
  ) as unknown as MatterTables;
}

export class MatterStorage {
  /** The tables outside a transaction: every call commits on its own. */
  readonly tables: MatterTables;

  constructor(private readonly context: PluginContext) {
    this.tables = context.storage.open(MATTER_STORAGE) as unknown as MatterTables;
  }

  /**
   * Runs `work` in one atomic transaction of the host. `tables` carries the transaction scope; `scope.afterCommit`
   * defers effects until the commit. The host orders concurrent transactions, so a read followed by a write in `work`
   * cannot be interleaved with another transaction's writes.
   */
  transaction<T>(work: (tables: MatterTables, scope: PluginTransactionScope) => Promise<T>): Promise<T> {
    return this.context.persistence.transaction((scope) => work(bindTables(this.tables, scope), scope));
  }
}

const cache = new WeakMap<PluginContext, MatterStorage>();

/** The storage of the plugin behind `context`; opened once per context. */
export function matterStorage(context: PluginContext): MatterStorage {
  let storage = cache.get(context);
  if (!storage) {
    storage = new MatterStorage(context);
    cache.set(context, storage);
  }
  return storage;
}

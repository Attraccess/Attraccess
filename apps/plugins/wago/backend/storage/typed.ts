import type {
  PluginStorageCallOptions,
  PluginStorageInsert,
  PluginStorageKey,
  PluginStoragePatch,
  PluginStorageQuery,
  PluginStorageRow,
  PluginStorageTable,
  PluginStorageWhere,
} from '@attraccess/plugins-backend-sdk';

/** A row as read, with the declared string columns narrowed to the unions `N` names. */
export type TypedRow<T extends PluginStorageTable, N extends object = object> = Omit<PluginStorageRow<T>, keyof N> & N;

type Insertable<T extends PluginStorageTable> = PluginStorageInsert<T>;

/** A row as written: narrowed columns keep their required/optional status from the declaration. */
export type TypedInsert<T extends PluginStorageTable, N extends object = object> = Omit<Insertable<T>, keyof N> & {
  [K in keyof N as K extends keyof Insertable<T> ? (undefined extends Insertable<T>[K] ? never : K) : never]: N[K];
} & {
  [K in keyof N as K extends keyof Insertable<T> ? (undefined extends Insertable<T>[K] ? K : never) : never]?: N[K];
};

/**
 * The record port of one table with the string columns that hold a closed set of values typed as that set. The
 * storage layer holds them as plain strings; the plugin owns the vocabulary (the 1.x entities typed them the same way).
 */
export interface TypedTableApi<T extends PluginStorageTable, N extends object = object> {
  insert(row: TypedInsert<T, N>, options?: PluginStorageCallOptions): Promise<TypedRow<T, N>>;
  insertMany(rows: readonly TypedInsert<T, N>[], options?: PluginStorageCallOptions): Promise<TypedRow<T, N>[]>;
  get(key: PluginStorageKey<T>, options?: PluginStorageCallOptions): Promise<TypedRow<T, N> | null>;
  find(query?: PluginStorageQuery<TypedRow<T, N>>, options?: PluginStorageCallOptions): Promise<TypedRow<T, N>[]>;
  findOne(
    query?: PluginStorageQuery<TypedRow<T, N>>,
    options?: PluginStorageCallOptions,
  ): Promise<TypedRow<T, N> | null>;
  count(where?: PluginStorageWhere<TypedRow<T, N>>, options?: PluginStorageCallOptions): Promise<number>;
  /** Atomic compare-and-set: the condition is evaluated together with the write; returns the affected row count. */
  update(
    where: PluginStorageWhere<TypedRow<T, N>>,
    patch: PluginStoragePatch<TypedRow<T, N>>,
    options?: PluginStorageCallOptions,
  ): Promise<number>;
  delete(where: PluginStorageWhere<TypedRow<T, N>>, options?: PluginStorageCallOptions): Promise<number>;
  upsert(
    row: TypedInsert<T, N>,
    options: PluginStorageCallOptions & {
      conflictOn: readonly (keyof TypedRow<T, N> & string)[];
      update?: readonly (keyof TypedRow<T, N> & string)[];
    },
  ): Promise<TypedRow<T, N>>;
  aggregate(
    field: keyof TypedRow<T, N> & string,
    where?: PluginStorageWhere<TypedRow<T, N>>,
    options?: PluginStorageCallOptions,
  ): Promise<{ min: unknown; max: unknown; sum: number | string | null; count: number }>;
}

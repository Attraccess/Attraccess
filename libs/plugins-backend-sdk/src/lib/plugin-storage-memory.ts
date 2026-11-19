/**
 * In-memory implementation of the plugin record port, for plugin unit tests.
 *
 * `createInMemoryPluginStorage(definition)` returns a `storage` (PluginStorageContext) and a `persistence`
 * (PluginPersistenceContext) that behave like the host's: declared tables only, the same validation, filters, order,
 * unique/primary keys, generated keys, defaults, foreign keys, compare-and-set updates, upserts and aggregates, the
 * neutral errors, and transactions that roll back completely and run `afterCommit` callbacks only after a commit.
 * Put both into the `PluginContext` a test hands to the plugin. The SDK's storage contract suite runs against this
 * fake and against the host, so the rules below hold on both.
 *
 * Behaviour a test can rely on, because the host guarantees it too:
 * - Transactions run one at a time here. A host either orders transactions or fails one of them with
 *   PluginStorageConflict (`conflictOnCommit` simulates that); it never retries.
 * - A write without scope waits for a running transaction and is a transaction of its own. Inside a transaction
 *   callback it throws, like a nested transaction and any call with a closed scope.
 * - A read without scope never waits: outside a transaction callback it sees the committed rows (never another
 *   transaction's uncommitted writes). Inside a callback pass `{ scope }` to read the transaction's own writes.
 * - Filters follow SQL: comparing a NULL value is unknown and does not match, also under `not` and `ne`/`notIn`.
 *   Use `isNull` or `eq: null` to match NULL; null inside `in`/`notIn` and as a comparison operand throws. An
 *   undefined filter value, a `null` filter and an empty operator object throw instead of matching everything; a
 *   missing filter (or `{}`) matches every row. Filter values are checked for their type only, so a string longer
 *   than the field or a decimal finer than its scale is a valid operand that matches what an exact comparison would.
 * - Rows come back ordered by `orderBy`, then by the primary key ascending (also without `orderBy`). NULL sorts first
 *   ascending. Booleans and JSON cannot be ordered or compared with lt/gt/between.
 * - Decimals are stored with the declared scale ("12.5" reads back as "12.50"); a value with more fraction digits
 *   than the scale is rejected, never rounded. `increment` treats NULL as 0.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { RecordEngine, type EngineClock } from './in-memory-storage/engine';
import { buildTableMetas } from './in-memory-storage/schema';
import { StorageState, type Snapshot } from './in-memory-storage/state';
import type { Row } from './in-memory-storage/values';
import type { PluginPersistenceContext, PluginTransactionScope } from './plugin-persistence';
import {
  PluginStorageConflict,
  PluginStorageInvalid,
  type PluginStorageCallOptions,
  type PluginStorageContext,
  type PluginStorageDefinition,
  type PluginStorageTableApi,
  type PluginStorageTables,
  type PluginStorageTablesApi,
} from './plugin-storage';

export interface InMemoryPluginStorageOptions {
  /** Clock used for `default: { now: true }`. Defaults to the system clock. */
  readonly now?: () => Date;
  /** Generator of uuid primary keys. Defaults to `crypto.randomUUID`. */
  readonly generateUuid?: () => string;
  /** Called with the error of a failed `afterCommit` callback. It is also collected in `afterCommitErrors`. */
  readonly onAfterCommitError?: (error: unknown) => void;
  /**
   * Simulates a conflict: called when the `work` of a transaction resolved, before the commit. When it returns
   * true, the transaction rolls back, its `afterCommit` callbacks never run and `transaction` rejects with
   * PluginStorageConflict, as a host does when it fails one of two conflicting transactions. Use it to test how
   * the plugin handles a failed transaction (and a retry of its own: the host never retries).
   */
  readonly conflictOnCommit?: () => boolean;
}

export interface InMemoryPluginStorage {
  /** Put this at `context.storage`. */
  readonly storage: PluginStorageContext;
  /** Put this at `context.persistence`. */
  readonly persistence: PluginPersistenceContext;
  /** Copy of the committed rows of a logical table, in insertion order (not the order `find` uses). For assertions. */
  rows(table: string): Row[];
  /** Deletes all rows and restarts generated keys. */
  reset(): void;
  /** Errors thrown by `afterCommit` callbacks (they never undo the commit). */
  readonly afterCommitErrors: unknown[];
}

class FakeTransactionScope implements PluginTransactionScope {
  private open = true;
  private readonly callbacks: Array<() => void | Promise<void>> = [];

  constructor(readonly owner: object) {}

  get isOpen(): boolean {
    return this.open;
  }

  afterCommit(callback: () => void | Promise<void>): void {
    if (!this.open) {
      throw new PluginStorageInvalid('Cannot register a post-commit callback on a closed transaction scope');
    }
    this.callbacks.push(callback);
  }

  close(): void {
    this.open = false;
  }

  discard(): void {
    this.callbacks.length = 0;
  }

  async flush(onError: (error: unknown) => void): Promise<void> {
    for (const callback of this.callbacks.splice(0)) {
      try {
        await callback();
      } catch (error) {
        onError(error);
      }
    }
  }
}

/** The message of a write without scope inside a transaction callback, as the host words it. */
const UNSCOPED_WRITE =
  'A write inside context.persistence.transaction needs the transaction scope: pass { scope } to the call.';
const NESTED_TRANSACTION =
  'A transaction was started inside a transaction callback. Nested calls would wait for locks the outer ' +
  'transaction holds and take a second connection; pass the callback scope down instead.';

class Runtime {
  readonly engine: RecordEngine;
  readonly state: StorageState;
  readonly afterCommitErrors: unknown[] = [];
  private readonly metas: ReturnType<typeof buildTableMetas>;
  private readonly clock: EngineClock;
  private readonly current = new AsyncLocalStorage<FakeTransactionScope>();
  private tail: Promise<unknown> = Promise.resolve();
  /** The committed rows while a transaction runs: what reads outside the transaction see. */
  private committed: Snapshot | undefined;

  constructor(
    readonly definition: PluginStorageDefinition,
    private readonly options: InMemoryPluginStorageOptions,
  ) {
    this.metas = buildTableMetas(definition);
    this.state = new StorageState(this.metas.keys());
    this.clock = { now: options.now ?? (() => new Date()), uuid: options.generateUuid ?? randomUUID };
    this.engine = new RecordEngine(this.metas, this.state, this.clock);
  }

  private exclusive<R>(work: () => R | Promise<R>): Promise<R> {
    const result = this.tail.then(work);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** The committed state: the snapshot of a running transaction's start, or the live rows otherwise. */
  committedState(): StorageState {
    return this.committed ? StorageState.of(this.committed) : this.state;
  }

  private checkScope(scope: PluginTransactionScope): void {
    if (!(scope instanceof FakeTransactionScope) || scope.owner !== this) {
      throw new PluginStorageInvalid('The transaction scope was not created by the host.');
    }
    if (!scope.isOpen) throw new PluginStorageInvalid('The transaction scope is closed.');
  }

  /**
   * Runs one storage call. With a scope it joins that transaction. Without one, a read runs at once: outside a
   * transaction callback it sees the committed rows (never another transaction's uncommitted writes), inside one the
   * live rows. A write without scope waits for the running transaction and is a transaction of its own; inside a
   * transaction callback it is refused (it would wait for the callback itself).
   */
  execute<R>(
    callOptions: PluginStorageCallOptions | undefined,
    access: 'read' | 'write',
    work: (engine: RecordEngine) => R,
  ): Promise<R> {
    try {
      const scope = callOptions?.scope;
      if (scope !== undefined) {
        this.checkScope(scope);
        return Promise.resolve(work(this.engine));
      }
      const inside = this.current.getStore()?.isOpen === true;
      if (access === 'read') {
        const view = inside ? this.state : this.committedState();
        return Promise.resolve(
          work(view === this.state ? this.engine : new RecordEngine(this.metas, view, this.clock)),
        );
      }
      if (inside) throw new PluginStorageInvalid(UNSCOPED_WRITE);
      return this.exclusive(() => work(this.engine));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async transaction<T>(work: (scope: PluginTransactionScope) => Promise<T>): Promise<T> {
    if (this.current.getStore()?.isOpen) throw new PluginStorageInvalid(NESTED_TRANSACTION);
    const scope = new FakeTransactionScope(this);
    const result = await this.exclusive(async () => {
      const snapshot = this.state.snapshot();
      this.committed = snapshot;
      try {
        const value = await this.current.run(scope, () => work(scope));
        if (this.options.conflictOnCommit?.()) {
          throw new PluginStorageConflict('The transaction conflicted with another one and was rolled back.');
        }
        return value;
      } catch (error) {
        this.state.restore(snapshot);
        scope.discard();
        throw error;
      } finally {
        this.committed = undefined;
        scope.close();
      }
    });
    await scope.flush((error) => {
      this.afterCommitErrors.push(error);
      this.options.onAfterCommitError?.(error);
    });
    return result;
  }
}

function tableApi(runtime: Runtime, table: string): PluginStorageTableApi<never> {
  const out = (row: Row) => runtime.engine.output(table, row);
  type Query = Parameters<RecordEngine['select']>[1];
  type UpsertOptions = PluginStorageCallOptions & { conflictOn: readonly string[]; update?: readonly string[] };
  const read = <R>(o: PluginStorageCallOptions | undefined, work: (engine: RecordEngine) => R) =>
    runtime.execute(o, 'read', work);
  const write = <R>(o: PluginStorageCallOptions | undefined, work: (engine: RecordEngine) => R) =>
    runtime.execute(o, 'write', work);
  const api = {
    insert: (row: unknown, o?: PluginStorageCallOptions) =>
      write(o, (engine) => out(engine.insertMany(table, [row])[0])),
    insertMany: (rows: readonly unknown[], o?: PluginStorageCallOptions) =>
      write(o, (engine) => {
        if (!Array.isArray(rows)) throw new PluginStorageInvalid('insertMany takes a list of rows.');
        return engine.insertMany(table, rows).map(out);
      }),
    get: (key: unknown, o?: PluginStorageCallOptions) =>
      read(o, (engine) => {
        const row = engine.get(table, key);
        return row && out(row);
      }),
    find: (query?: Query, o?: PluginStorageCallOptions) => read(o, (engine) => engine.select(table, query).map(out)),
    findOne: (query?: Query, o?: PluginStorageCallOptions) =>
      read(o, (engine) => {
        const row = engine.select(table, { ...query, limit: 1 })[0];
        return row ? out(row) : null;
      }),
    count: (where?: unknown, o?: PluginStorageCallOptions) => read(o, (engine) => engine.count(table, where)),
    update: (where: unknown, patch: never, o?: PluginStorageCallOptions) =>
      write(o, (engine) => engine.update(table, where, patch)),
    delete: (where: unknown, o?: PluginStorageCallOptions) => write(o, (engine) => engine.remove(table, where)),
    upsert: (row: unknown, o: UpsertOptions) =>
      write(o, (engine) => out(engine.upsert(table, row, o?.conflictOn, o?.update))),
    aggregate: (field: string, where?: unknown, o?: PluginStorageCallOptions) =>
      read(o, (engine) => engine.aggregate(table, field, where)),
  };
  return api as unknown as PluginStorageTableApi<never>;
}

/**
 * Creates the fake record port for one plugin storage definition (the one registered as
 * `PluginBackendModule.storage`). `storage.open` serves only that definition.
 */
export function createInMemoryPluginStorage(
  definition: PluginStorageDefinition,
  options: InMemoryPluginStorageOptions = {},
): InMemoryPluginStorage {
  const runtime = new Runtime(definition, options);
  const storage: PluginStorageContext = {
    open<Tables extends PluginStorageTables>(requested: PluginStorageDefinition<Tables>) {
      if (
        requested !== (runtime.definition as unknown) &&
        requested.tables !== (runtime.definition.tables as unknown)
      ) {
        throw new PluginStorageInvalid('Only the storage definition the plugin registered can be opened.');
      }
      return Object.fromEntries(
        Object.keys(requested.tables).map((name) => [name, tableApi(runtime, name)]),
      ) as unknown as PluginStorageTablesApi<Tables>;
    },
  };
  return {
    storage,
    persistence: { transaction: (work) => runtime.transaction(work) },
    rows: (table) =>
      runtime
        .committedState()
        .table(runtime.engine.meta(table).name)
        .map((row) => runtime.engine.output(table, row)),
    reset: () => runtime.state.clear(),
    afterCommitErrors: runtime.afterCommitErrors,
  };
}

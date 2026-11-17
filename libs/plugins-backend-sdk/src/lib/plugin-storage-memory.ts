/**
 * In-memory implementation of the plugin record port, for plugin unit tests.
 *
 * `createInMemoryPluginStorage(definition)` returns a `storage` (PluginStorageContext) and a `persistence`
 * (PluginPersistenceContext) that behave like the host's: declared tables only, the same validation, filters, order,
 * unique/primary keys, generated keys, defaults, foreign keys, compare-and-set updates, upserts and aggregates, the
 * neutral errors, and transactions that roll back completely and run `afterCommit` callbacks only after a commit.
 * Put both into the `PluginContext` a test hands to the plugin.
 *
 * Behaviour a test can rely on, because the host guarantees it too:
 * - Transactions run one at a time (SQLite semantics); a call without a scope waits for an open transaction.
 *   A call without a scope *inside* a transaction, a nested transaction and a call with a closed scope throw.
 * - Filters follow SQL: comparing a NULL value is unknown and does not match, also under `not` and `ne`/`notIn`.
 *   Use `isNull` or `eq: null` to match NULL. An undefined filter value throws instead of matching everything.
 * - Ordering is only defined by `orderBy`; NULL sorts first ascending. Without it rows come back in insertion order
 *   (do not depend on that in plugin code).
 * - Decimals are stored with the declared scale ("12.5" reads back as "12.50"); a value with more fraction digits
 *   than the scale is rejected, never rounded.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { RecordEngine } from './in-memory-storage/engine';
import { buildTableMetas } from './in-memory-storage/schema';
import { StorageState } from './in-memory-storage/state';
import type { Row } from './in-memory-storage/values';
import type { PluginPersistenceContext, PluginTransactionScope } from './plugin-persistence';
import {
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
}

export interface InMemoryPluginStorage {
  /** Put this at `context.storage`. */
  readonly storage: PluginStorageContext;
  /** Put this at `context.persistence`. */
  readonly persistence: PluginPersistenceContext;
  /** Copy of the committed rows of a logical table, in insertion order. For assertions. */
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
    if (!this.open) throw new PluginStorageInvalid('afterCommit was called on a transaction that already ended.');
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

class Runtime {
  readonly engine: RecordEngine;
  readonly state: StorageState;
  readonly afterCommitErrors: unknown[] = [];
  private readonly current = new AsyncLocalStorage<FakeTransactionScope>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    readonly definition: PluginStorageDefinition,
    private readonly options: InMemoryPluginStorageOptions,
  ) {
    const metas = buildTableMetas(definition);
    this.state = new StorageState(metas.keys());
    this.engine = new RecordEngine(metas, this.state, {
      now: options.now ?? (() => new Date()),
      uuid: options.generateUuid ?? randomUUID,
    });
  }

  private exclusive<R>(work: () => R | Promise<R>): Promise<R> {
    const result = this.tail.then(work);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Runs one storage call: joined to its transaction when it has a scope, else alone after any open transaction. */
  execute<R>(callOptions: PluginStorageCallOptions | undefined, work: () => R): Promise<R> {
    const scope = callOptions?.scope;
    if (scope === undefined) {
      if (this.current.getStore()) {
        return Promise.reject(
          new PluginStorageInvalid('Inside persistence.transaction every storage call must pass { scope }.'),
        );
      }
      return this.exclusive(work);
    }
    if (!(scope instanceof FakeTransactionScope) || scope.owner !== this || !scope.isOpen) {
      return Promise.reject(new PluginStorageInvalid('The scope is not an open transaction of this storage.'));
    }
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async transaction<T>(work: (scope: PluginTransactionScope) => Promise<T>): Promise<T> {
    if (this.current.getStore()) {
      throw new Error('A transaction cannot be started inside another one; pass the scope down instead.');
    }
    const scope = new FakeTransactionScope(this);
    const result = await this.exclusive(async () => {
      const snapshot = this.state.snapshot();
      try {
        return await this.current.run(scope, () => work(scope));
      } catch (error) {
        this.state.restore(snapshot);
        scope.discard();
        throw error;
      } finally {
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
  const { engine } = runtime;
  const out = (row: Row) => engine.output(table, row);
  const api = {
    insert: (row: unknown, o?: PluginStorageCallOptions) =>
      runtime.execute(o, () => out(engine.insertMany(table, [row])[0])),
    insertMany: (rows: readonly unknown[], o?: PluginStorageCallOptions) =>
      runtime.execute(o, () => engine.insertMany(table, rows).map(out)),
    get: (key: unknown, o?: PluginStorageCallOptions) =>
      runtime.execute(o, () => {
        const row = engine.get(table, key);
        return row && out(row);
      }),
    find: (query?: Parameters<RecordEngine['select']>[1], o?: PluginStorageCallOptions) =>
      runtime.execute(o, () => engine.select(table, query).map(out)),
    findOne: (query?: Parameters<RecordEngine['select']>[1], o?: PluginStorageCallOptions) =>
      runtime.execute(o, () => {
        const row = engine.select(table, { ...query, limit: 1 })[0];
        return row ? out(row) : null;
      }),
    count: (where?: unknown, o?: PluginStorageCallOptions) => runtime.execute(o, () => engine.count(table, where)),
    update: (where: unknown, patch: never, o?: PluginStorageCallOptions) =>
      runtime.execute(o, () => engine.update(table, where, patch)),
    delete: (where: unknown, o?: PluginStorageCallOptions) => runtime.execute(o, () => engine.remove(table, where)),
    upsert: (
      row: unknown,
      o: PluginStorageCallOptions & { conflictOn: readonly string[]; update?: readonly string[] },
    ) => runtime.execute(o, () => out(engine.upsert(table, row, o.conflictOn, o.update))),
    aggregate: (field: string, where?: unknown, o?: PluginStorageCallOptions) =>
      runtime.execute(o, () => engine.aggregate(table, field, where)),
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
      runtime.state.table(runtime.engine.meta(table).name).map((row) => runtime.engine.output(table, row)),
    reset: () => runtime.state.clear(),
    afterCommitErrors: runtime.afterCommitErrors,
  };
}

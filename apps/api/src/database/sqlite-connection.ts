import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, DataSourceOptions, QueryRunner, TransactionNotStartedError } from 'typeorm';

/** How long every connection to the SQLite file waits for another connection's write lock before SQLITE_BUSY. */
export const SQLITE_BUSY_TIMEOUT_MS = 5000;

/** TypeORM's SQLite query runner keeps its transaction state protected; the guard reads and resets it. */
type RunnerInternals = QueryRunner & { transactionDepth: number; isTransactionActive: boolean };

const guardedRunners = new WeakSet<QueryRunner>();

/**
 * Builds a DataSource whose SQLite connection waits for the write lock held by another connection to the same file
 * (the resource-lifecycle and audit connections) instead of failing with SQLITE_BUSY. Other drivers are unchanged.
 * Not for read-only connections: they cannot begin IMMEDIATE transactions.
 */
export function createDataSource(options: DataSourceOptions): DataSource {
  if (options.type !== 'sqlite') return new DataSource(options);
  const busyTimeout = options.busyTimeout ?? SQLITE_BUSY_TIMEOUT_MS;
  const source = new DataSource({ ...options, busyTimeout });
  const isolation = createIsolation(busyTimeout);
  // The SQLite driver hands every caller the same query runner, so patching it covers all work on the connection.
  const driver = source.driver;
  const createQueryRunner = driver.createQueryRunner.bind(driver);
  driver.createQueryRunner = (mode) => guardSharedRunner(createQueryRunner(mode), isolation);
  // Entry points that start transactions through the runner (or run work on it) give the call its own flow.
  enterFlows(source.manager, isolation, ['transaction', 'save', 'remove', 'softRemove', 'recover']);
  enterFlows(source, isolation, ['runMigrations', 'undoLastMigration', 'synchronize', 'dropDatabase']);
  return source;
}

/** One async flow: the identity of whoever started a transaction. Compared by reference. */
type Flow = object;

/** Per DataSource: which flow owns the connection's open transaction, and the ability to wait for it to end. */
type Isolation = ReturnType<typeof createIsolation>;

function createIsolation(busyTimeout: number) {
  const flows = new AsyncLocalStorage<Flow>();
  let owner: Flow | undefined;
  let ended: Promise<void> = Promise.resolve();
  let end: () => void = () => undefined;
  const busyError = () =>
    Object.assign(
      new Error(
        `SQLITE_BUSY: waited ${busyTimeout} ms for another flow's transaction on the main connection to end. ` +
          `Work a transaction awaits must run inside its async context.`,
      ),
      { code: 'SQLITE_BUSY' },
    );
  const isolation = {
    flows,
    get owner() {
      return owner;
    },
    isForeign: (flow: Flow | undefined) => owner !== undefined && owner !== flow,
    claim(flow: Flow) {
      owner = flow;
      ended = new Promise((resolve) => (end = resolve));
    },
    release() {
      owner = undefined;
      end();
    },
    /** Waits until `flow` is no longer foreign, at most `busyTimeout` from `since`. Check again after it returns. */
    async waitForOwner(flow: Flow | undefined, since: number) {
      while (isolation.isForeign(flow)) {
        const left = since + busyTimeout - Date.now();
        if (left <= 0) throw busyError();
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([ended, new Promise((resolve) => (timer = setTimeout(resolve, left)))]);
        } finally {
          clearTimeout(timer);
        }
      }
    },
  };
  return isolation;
}

/**
 * Wraps methods so each call runs in a flow of its own, or in the owner's flow when called inside the owner's
 * transaction (nested calls become savepoints). A flow reused after its transaction ended would let two calls of it
 * start concurrent transactions that nest in each other, so only the current owner's flow is reused.
 */
function enterFlows(target: object, isolation: Isolation, names: string[]) {
  const methods = target as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of names) {
    // Resolved per call, so a spy on the prototype still sees the call.
    const original = (...args: unknown[]) => Object.getPrototypeOf(target)[name].apply(target, args);
    methods[name] = (...args) => {
      const current = isolation.flows.getStore();
      const flow = current !== undefined && current === isolation.owner ? current : {};
      return isolation.flows.run(flow, () => original(...args));
    };
  }
}

/**
 * TypeORM 0.3.x exposes isolation levels but not SQLite BEGIN modes. A deferred BEGIN reserves the writer only at its
 * first write, and SQLite fails that upgrade at once with SQLITE_BUSY, without waiting for busy_timeout, while the
 * connection holds a read lock. BEGIN IMMEDIATE reserves the writer up front and waits through the busy handler.
 * TypeORM stays in charge of transaction depth, savepoints, subscribers and rollback.
 *
 * Concurrent flows share the runner, and so the connection, its locks and its transaction. A transaction therefore
 * belongs to the async flow (AsyncLocalStorage) that started it:
 * - The outermost start claims ownership, even while its BEGIN is pending, until the outermost COMMIT or ROLLBACK
 *   ends. While a flow owns the transaction, every statement and transaction start of any other flow (reads too)
 *   waits for it, in arrival order, and then runs on its own (a transaction start begins its own top-level BEGIN).
 *   Other flows see no active transaction, so TypeORM's save() starts a transaction of its own instead of joining.
 *   Nested transactions and statements of the owner's flow, also through the root manager, run inside it as
 *   savepoints, as before.
 * - A flow is created by the entry points on the DataSource and its manager (transaction, save, remove, softRemove,
 *   recover, migrations, synchronize). Code without such a context is a flow of its own per call, never the owner's.
 *   A direct runner.startTransaction() without a context claims a flow for the caller's synchronous continuation.
 * - A waiter gives up after the busy timeout and rejects with code SQLITE_BUSY without touching the transaction.
 *   Work a transaction awaits that runs in another async context (a promise created before the transaction, a callback
 *   that lost the context) is such a waiter: it fails after the timeout instead of hanging, the transaction continues.
 * Remaining statements of a flow serialize on the connection:
 * - A statement still running for one flow holds a read lock that makes another flow's BEGIN or write outside a
 *   transaction fail at once. Those statements wait until no statement is running, and later statements wait for them.
 * - A transaction start of the owner's flow that races the outermost COMMIT waits for it and then begins its own
 *   transaction. The outermost COMMIT or ROLLBACK waits for a nested start, and a start waits for it, so neither acts
 *   on a stale depth. Without that, a savepoint lands outside the committed transaction and leaves the runner in one
 *   that never ends. A failed outermost COMMIT rolls back before the gate opens, for the same reason.
 * Subscribers run in the owner's flow. They must not start a transaction on this connection (including save()) from a
 * transaction event, nor run a query from a query event: they would wait for themselves. A transaction must not
 * await work that runs in another async context and needs this connection; that work waits for the timeout.
 */
function guardSharedRunner(runner: QueryRunner, isolation: Isolation): QueryRunner {
  if (guardedRunners.has(runner)) return runner;
  const internals = runner as RunnerInternals;
  if (typeof internals.transactionDepth !== 'number') {
    throw new Error('Unsupported TypeORM SQLite query runner: transactionDepth is not readable');
  }
  guardedRunners.add(runner);
  const { flows, isForeign } = isolation;
  // Other flows must not see (or join) the owner's transaction: TypeORM's save() decides by this flag whether it
  // opens a transaction of its own.
  let active = internals.isTransactionActive;
  Object.defineProperty(runner, 'isTransactionActive', {
    configurable: true,
    enumerable: true,
    get: () => active && !isForeign(flows.getStore()),
    set: (value: boolean) => void (active = value),
  });
  const query = runner.query.bind(runner);
  const startTransaction = runner.startTransaction.bind(runner);
  const commitTransaction = runner.commitTransaction.bind(runner);
  const rollbackTransaction = runner.rollbackTransaction.bind(runner);
  let running = 0;
  let settled: Promise<void> = Promise.resolve();
  let settle: () => void = () => undefined;
  let exclusive: Promise<unknown> | undefined;
  let starting: Promise<void> | undefined;
  let ending: Promise<void> | undefined;
  let nesting = 0;
  let nested: Promise<void> = Promise.resolve();
  let nestedSettle: () => void = () => undefined;

  // Closes the gate before `step` runs: TypeORM may broadcast to subscribers synchronously at its start.
  // `after` runs once the step ended, before the gate opens.
  const gated = async (
    close: (gate: Promise<void> | undefined) => void,
    step: () => Promise<void>,
    after?: () => void,
  ) => {
    let open!: () => void;
    close(new Promise((resolve) => (open = resolve)));
    try {
      await step();
    } finally {
      close(undefined);
      after?.();
      open();
    }
  };
  const run = (sql: string, parameters?: unknown[], useStructuredResult?: boolean) =>
    useStructuredResult ? query(sql, parameters, true) : query(sql, parameters);
  const runAlone = async (sql: string, parameters?: unknown[], useStructuredResult?: boolean) => {
    while (running > 0) await settled;
    return run(sql, parameters, useStructuredResult);
  };
  runner.query = async (sql: string, parameters?: unknown[], useStructuredResult?: boolean) => {
    const flow = flows.getStore();
    let since: number | undefined;
    for (;;) {
      if (isForeign(flow)) await isolation.waitForOwner(flow, (since ??= Date.now()));
      else if (exclusive) await exclusive.catch(() => undefined);
      else break;
    }
    if (sql === 'BEGIN TRANSACTION' || (internals.transactionDepth === 0 && !/^\s*SELECT\b/i.test(sql))) {
      const statement = sql === 'BEGIN TRANSACTION' ? 'BEGIN IMMEDIATE TRANSACTION' : sql;
      const alone = runAlone(statement, parameters, useStructuredResult);
      exclusive = alone;
      try {
        return await alone;
      } finally {
        exclusive = undefined;
      }
    }
    if (running++ === 0) settled = new Promise((resolve) => (settle = resolve));
    try {
      return await run(sql, parameters, useStructuredResult);
    } finally {
      if (--running === 0) settle();
    }
  };
  runner.startTransaction = async (isolationLevel) => {
    let flow = flows.getStore();
    if (flow === undefined) flows.enterWith((flow = {}));
    let since: number | undefined;
    for (;;) {
      if (isForeign(flow)) await isolation.waitForOwner(flow, (since ??= Date.now()));
      else if (starting || ending) await (starting ?? ending);
      else break;
    }
    if (internals.transactionDepth === 0) {
      const owner = flow;
      isolation.claim(owner);
      try {
        return await flows.run(owner, () =>
          gated(
            (gate) => (starting = gate),
            () => startTransaction(isolationLevel),
          ),
        );
      } catch (error) {
        // The BEGIN never happened: nothing is left to end, so other flows may go on.
        if (internals.transactionDepth === 0) isolation.release();
        throw error;
      }
    }
    if (nesting++ === 0) nested = new Promise((resolve) => (nestedSettle = resolve));
    try {
      await startTransaction(isolationLevel);
    } finally {
      if (--nesting === 0) nestedSettle();
    }
  };
  const endTransaction = async (end: () => Promise<void>) => {
    while (nesting > 0) await nested;
    if (internals.transactionDepth !== 1) return end();
    return gated(
      (gate) => (ending = gate),
      end,
      () => {
        if (internals.transactionDepth === 0) isolation.release();
      },
    );
  };
  // If the outermost COMMIT fails, roll back while the gate is still closed. The caller's own rollback then finds no
  // transaction, and TypeORM's callers ignore that error.
  const commitOrRollBack = async () => {
    try {
      await commitTransaction();
    } catch (error) {
      if (active && internals.transactionDepth === 1) {
        await rollbackTransaction().catch(() => undefined);
      }
      throw error;
    }
  };
  // Another flow has no transaction to end: it must not end the owner's.
  runner.commitTransaction = async () => {
    if (isForeign(flows.getStore())) throw new TransactionNotStartedError();
    return endTransaction(commitOrRollBack);
  };
  // A rejected BEGIN leaves TypeORM at depth 0 without a SQLite transaction. Its ROLLBACK would fail, or end the
  // transaction another flow began meanwhile, so only reset the state. If another flow's BEGIN is pending, its
  // startTransaction already set isTransactionActive, so leave it. This skips the rollback subscriber events.
  runner.rollbackTransaction = async () => {
    if (isForeign(flows.getStore())) return;
    if (!active || internals.transactionDepth > 0) return endTransaction(rollbackTransaction);
    if (!starting) active = false;
  };
  return runner;
}

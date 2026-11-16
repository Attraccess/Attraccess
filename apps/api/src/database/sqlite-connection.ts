import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';

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
  const source = new DataSource({ ...options, busyTimeout: options.busyTimeout ?? SQLITE_BUSY_TIMEOUT_MS });
  // The SQLite driver hands every caller the same query runner, so patching it covers all work on the connection.
  const driver = source.driver;
  const createQueryRunner = driver.createQueryRunner.bind(driver);
  driver.createQueryRunner = (mode) => guardSharedRunner(createQueryRunner(mode));
  return source;
}

/**
 * TypeORM 0.3.x exposes isolation levels but not SQLite BEGIN modes. A deferred BEGIN reserves the writer only at its
 * first write, and SQLite fails that upgrade at once with SQLITE_BUSY, without waiting for busy_timeout, while the
 * connection holds a read lock. BEGIN IMMEDIATE reserves the writer up front and waits through the busy handler.
 * TypeORM stays in charge of transaction depth, savepoints, subscribers and rollback.
 *
 * Concurrent flows share the runner, and so the connection and its locks:
 * - A statement still running for one flow holds a read lock that makes another flow's BEGIN or write outside a
 *   transaction fail at once. Those statements wait until no statement is running, and later statements wait for them.
 * - A transaction that starts while another flow's BEGIN is pending waits for it, then nests as a savepoint. The
 *   outermost COMMIT or ROLLBACK waits for such a start, and a start waits for it, so neither acts on a stale depth.
 *   Without that, a savepoint lands outside the committed transaction and leaves the runner in one that never ends.
 *   A failed outermost COMMIT rolls back before the gate opens, for the same reason.
 * Subscribers must not start a transaction on this connection (including save()) from a transaction event, nor run
 * a query from a query event: they would wait for themselves.
 */
function guardSharedRunner(runner: QueryRunner): QueryRunner {
  if (guardedRunners.has(runner)) return runner;
  const internals = runner as RunnerInternals;
  if (typeof internals.transactionDepth !== 'number') {
    throw new Error('Unsupported TypeORM SQLite query runner: transactionDepth is not readable');
  }
  guardedRunners.add(runner);
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
  const gated = async (close: (gate: Promise<void> | undefined) => void, step: () => Promise<void>) => {
    let open!: () => void;
    close(new Promise((resolve) => (open = resolve)));
    try {
      await step();
    } finally {
      close(undefined);
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
    while (exclusive) await exclusive.catch(() => undefined);
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
    while (starting || ending) await (starting ?? ending);
    if (internals.transactionDepth === 0) {
      return gated(
        (gate) => (starting = gate),
        () => startTransaction(isolationLevel),
      );
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
    return gated((gate) => (ending = gate), end);
  };
  // If the outermost COMMIT fails, roll back while the gate is still closed. The caller's own rollback then finds no
  // transaction, and TypeORM's callers ignore that error.
  const commitOrRollBack = async () => {
    try {
      await commitTransaction();
    } catch (error) {
      if (internals.isTransactionActive && internals.transactionDepth === 1) {
        await rollbackTransaction().catch(() => undefined);
      }
      throw error;
    }
  };
  runner.commitTransaction = () => endTransaction(commitOrRollBack);
  // A rejected BEGIN leaves TypeORM at depth 0 without a SQLite transaction. Its ROLLBACK would fail, or end the
  // transaction another flow began meanwhile, so only reset the state. If another flow's BEGIN is pending, its
  // startTransaction already set isTransactionActive, so leave it. This skips the rollback subscriber events.
  runner.rollbackTransaction = async () => {
    if (!internals.isTransactionActive || internals.transactionDepth > 0) return endTransaction(rollbackTransaction);
    if (!starting) internals.isTransactionActive = false;
  };
  return runner;
}

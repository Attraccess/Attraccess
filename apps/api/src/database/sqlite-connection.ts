import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';

/** How long every connection to the SQLite file waits for another connection's write lock before SQLITE_BUSY. */
export const SQLITE_BUSY_TIMEOUT_MS = 5000;

/** TypeORM's SQLite query runner keeps its transaction depth protected; these helpers need to read it. */
type SqliteQueryRunner = QueryRunner & { transactionDepth: number; isTransactionActive: boolean };

const immediateRunners = new WeakSet<QueryRunner>();

/**
 * Builds a DataSource whose SQLite connection waits for the write lock held by another connection to the same file
 * (the resource-lifecycle and audit connections) instead of failing with SQLITE_BUSY. Other drivers are unchanged.
 */
export function createDataSource(options: DataSourceOptions): DataSource {
  if (options.type !== 'sqlite') return new DataSource(options);
  const source = new DataSource({ ...options, busyTimeout: options.busyTimeout ?? SQLITE_BUSY_TIMEOUT_MS });
  // The SQLite driver hands every caller the same query runner, so patching it covers all work on the connection.
  const driver = source.driver;
  const createQueryRunner = driver.createQueryRunner.bind(driver);
  driver.createQueryRunner = (mode) => beginImmediately(createQueryRunner(mode));
  return source;
}

/**
 * TypeORM 0.3.x exposes isolation levels but not SQLite BEGIN modes. A deferred BEGIN reserves the writer only at its
 * first write, and SQLite fails that upgrade at once with SQLITE_BUSY, without waiting for busy_timeout, while the
 * connection holds a read lock. BEGIN IMMEDIATE reserves the writer up front and waits through the busy handler.
 * TypeORM stays in charge of transaction depth, savepoints, subscribers and rollback.
 *
 * Concurrent flows share the runner, and so the connection's locks. A statement still running for one flow holds a
 * read lock that makes another flow's BEGIN or autocommit write fail at once, so those run alone: they wait for the
 * running statements, and later statements wait for them. A flow that joins the active transaction therefore still
 * runs inside it, and a transaction another flow starts meanwhile nests as a savepoint instead of a second BEGIN.
 */
function beginImmediately(runner: QueryRunner): QueryRunner {
  if (immediateRunners.has(runner)) return runner;
  immediateRunners.add(runner);
  const sqlite = runner as SqliteQueryRunner;
  const query = runner.query.bind(runner);
  const startTransaction = runner.startTransaction.bind(runner);
  const rollbackTransaction = runner.rollbackTransaction.bind(runner);
  let running = 0;
  let settled: Promise<void> = Promise.resolve();
  let settle: () => void = () => undefined;
  let exclusive: Promise<unknown> | undefined;
  let starting: Promise<void> | undefined;

  const run = (sql: string, parameters?: unknown[], useStructuredResult?: boolean) =>
    useStructuredResult ? query(sql, parameters, true) : query(sql, parameters);
  const runAlone = async (sql: string, parameters?: unknown[], useStructuredResult?: boolean) => {
    while (running > 0) await settled;
    return run(sql, parameters, useStructuredResult);
  };
  runner.query = async (sql: string, parameters?: unknown[], useStructuredResult?: boolean) => {
    while (exclusive) await exclusive.catch(() => undefined);
    if (sql === 'BEGIN TRANSACTION' || (sqlite.transactionDepth === 0 && !/^\s*SELECT\b/i.test(sql))) {
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
    while (starting) await starting.catch(() => undefined);
    if (sqlite.transactionDepth > 0) return startTransaction(isolationLevel);
    starting = startTransaction(isolationLevel);
    try {
      await starting;
    } finally {
      starting = undefined;
    }
  };
  // A rejected BEGIN leaves TypeORM at depth 0 without a SQLite transaction. Its ROLLBACK would fail, or end the
  // transaction another flow began meanwhile, so only reset the state.
  runner.rollbackTransaction = async () => {
    if (!sqlite.isTransactionActive || sqlite.transactionDepth > 0) return rollbackTransaction();
    if (!starting) sqlite.isTransactionActive = false;
  };
  return runner;
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, DataSourceOptions, QueryRunner, TransactionNotStartedError } from 'typeorm';

/** How long every connection to the SQLite file waits for another connection's write lock before SQLITE_BUSY. */
export const SQLITE_BUSY_TIMEOUT_MS = 5000;

/** TypeORM's SQLite query runner keeps its transaction state protected; the guard reads and resets it. */
type RunnerInternals = QueryRunner & { transactionDepth: number; isTransactionActive: boolean };

const guardedRunners = new WeakSet<QueryRunner>();

const noTransaction = () => false;

/** The EntityManager methods that start transactions on the runner themselves (TypeORM 0.3.x EntityPersistExecutor). */
const MANAGER_ENTRY_POINTS = ['transaction', 'save', 'remove', 'softRemove', 'recover'];

/**
 * Builds a DataSource whose SQLite connection waits for the write lock held by another connection to the same file
 * (the resource-lifecycle and audit connections) instead of failing with SQLITE_BUSY, and whose transactions belong
 * to the async flow that started them: statements of other flows wait for them, at most the busy timeout (see
 * guardSharedRunner). Other drivers are unchanged. Not for read-only connections: they cannot begin IMMEDIATE
 * transactions.
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
  // Entry points that start transactions through the runner (or run work on it) give the call its own flow. The
  // constructor built source.manager already; every later manager (createQueryRunner().manager, the transactional
  // manager of transaction()) is wrapped as it is created.
  enterFlows(source.manager, isolation, MANAGER_ENTRY_POINTS);
  source.createEntityManager = (queryRunner) => {
    const manager = Object.getPrototypeOf(source).createEntityManager.call(source, queryRunner);
    enterFlows(manager, isolation, MANAGER_ENTRY_POINTS);
    return manager;
  };
  enterFlows(source, isolation, ['runMigrations', 'undoLastMigration', 'synchronize', 'dropDatabase']);
  return source;
}

/** One async flow: the identity of whoever started a transaction. Compared by reference. */
type Flow = object;

/** Per DataSource: which flow owns the connection's open transaction, and the queue of flows waiting for it. */
type Isolation = ReturnType<typeof createIsolation>;

/** A flow waiting for the owner: a transaction start (`claims`) or a statement. */
type Waiter = { flow: Flow; claims: boolean; wake: (passed: boolean) => void; timer?: NodeJS.Timeout };

function createIsolation(busyTimeout: number) {
  const flows = new AsyncLocalStorage<Flow>();
  let owner: Flow | undefined;
  // Counts claims, so a start can tell whether the ownership it claimed is still its own (see release).
  let ticket = 0;
  // Arrival order. While anyone waits, an owner is set, so newcomers queue behind the waiters instead of barging.
  const queue: Waiter[] = [];
  // Statements of other flows let through at a release that have not finished: the next owner's BEGIN waits for them.
  let passes = 0;
  let drained: Promise<void> = Promise.resolve();
  let drain: () => void = () => undefined;
  const busyError = () =>
    Object.assign(
      new Error(
        `SQLITE_BUSY: waited ${busyTimeout} ms for another flow's transaction on this connection to end ` +
          `(heavy load, or work a transaction awaits that runs outside its async context)`,
      ),
      { code: 'SQLITE_BUSY' },
    );
  const dequeue = (waiter: Waiter) => {
    clearTimeout(waiter.timer);
    const index = queue.indexOf(waiter);
    if (index >= 0) queue.splice(index, 1);
  };
  const isolation = {
    flows,
    get owner() {
      return owner;
    },
    isForeign: (flow: Flow | undefined) => owner !== undefined && owner !== flow,
    /** Returns the claim's ticket. */
    claim(flow: Flow) {
      owner = flow;
      return ++ticket;
    },
    /**
     * Ends the ownership and hands the connection on, waking only whom it lets through: the statements queued before
     * the first waiting transaction start, then that start as the new owner, with the waiters of its own flow. With
     * a ticket, only if no claim or hand-off happened since: a failed start must not end a newer start's ownership.
     */
    release(claimed?: number) {
      if (claimed !== undefined && claimed !== ticket) return;
      owner = undefined;
      for (let waiter = queue[0]; waiter; waiter = queue[0]) {
        dequeue(waiter);
        if (waiter.claims) {
          owner = waiter.flow;
          ticket++;
          waiter.wake(false);
          for (const same of queue.filter((queued) => queued.flow === owner)) {
            dequeue(same);
            same.wake(false);
          }
          return;
        }
        if (passes++ === 0) drained = new Promise((resolve) => (drain = resolve));
        waiter.wake(true);
      }
    },
    /** A statement let through at a release has finished. */
    endPass() {
      if (--passes === 0) drain();
    },
    async passesDrained() {
      while (passes > 0) await drained;
    },
    /**
     * Queues `flow` behind the owner and the earlier waiters, at most `busyTimeout`, then rejects with SQLITE_BUSY.
     * Resolves on its turn: a transaction start then owns the connection (false), or its flow became the owner's
     * (false), or a statement was let through (true: call endPass once it ran).
     */
    wait(flow: Flow, claims: boolean) {
      return new Promise<boolean>((resolve, reject) => {
        const waiter: Waiter = { flow, claims, wake: resolve };
        waiter.timer = setTimeout(() => {
          dequeue(waiter);
          reject(busyError());
        }, busyTimeout);
        queue.push(waiter);
      });
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
 *   ends, or until a failed ROLLBACK after SQLite already discarded the transaction resets the runner. While a
 *   flow owns the transaction, every statement and transaction start of any other flow (reads too) waits for it in a
 *   FIFO queue. Each release wakes the statements queued before the next transaction start, then hands ownership to
 *   that start, which begins its own top-level BEGIN once those statements finished. Other flows see no active
 *   transaction, so TypeORM's save() starts a transaction of its own instead of joining, and cannot end the owner's
 *   (commit throws TransactionNotStartedError, rollback does nothing). Nested transactions and statements of the
 *   owner's flow, also through the root manager, run inside it as savepoints, as before. TypeORM's savepoints form one
 *   stack, so nested transactions of one flow must not run concurrently (Promise.all): which writes survive is then
 *   undefined, though the connection is freed when the outer transaction ends.
 * - A flow is created by the entry points on the DataSource and on every EntityManager it creates (transaction, save,
 *   remove, softRemove, recover, migrations, synchronize). Code without such a context is a flow of its own per call,
 *   never the owner's. Work forked inside the owner's transaction without being awaited (a timer, an event listener,
 *   `void promise`) inherits the owner's flow and joins the transaction while it lasts.
 * - A direct runner.startTransaction() without a context has no entry point, so it enters a new flow into the
 *   caller's async context (AsyncLocalStorage.enterWith). That context reaches the caller's callers and everything
 *   they start afterwards: work they start alongside it joins the transaction, and a second direct start from the
 *   same context nests in it. Start such transactions through transaction() instead.
 * - A waiter gives up after the busy timeout, counted from its arrival, and rejects with code SQLITE_BUSY without
 *   touching the transaction. Work a transaction awaits that runs in another async context (a promise created before
 *   the transaction, a callback that lost the context) is such a waiter: it fails after the timeout instead of
 *   hanging, the transaction continues. DB metrics wrapped around runner.query count this wait as query time.
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
    // Let through at a release: runs on its own even if the next owner was already chosen (its BEGIN waits for it).
    let passed = false;
    for (;;) {
      if (!passed && isForeign(flow)) passed = await isolation.wait(flow ?? {}, false);
      else if (exclusive) await exclusive.catch(() => undefined);
      else break;
    }
    try {
      return await runOnConnection(sql, parameters, useStructuredResult);
    } finally {
      if (passed) isolation.endPass();
    }
  };
  const runOnConnection = async (sql: string, parameters?: unknown[], useStructuredResult?: boolean) => {
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
    // Waking from the queue makes this flow the owner. A gate can hand ownership to a queued flow meanwhile: check again.
    for (;;) {
      if (isForeign(flow)) await isolation.wait(flow, true);
      else if (starting || ending) await (starting ?? ending);
      else break;
    }
    if (internals.transactionDepth === 0) {
      const claimed = isolation.claim(flow);
      try {
        return await gated(
          (gate) => (starting = gate),
          async () => {
            await isolation.passesDrained();
            await startTransaction(isolationLevel);
          },
        );
      } catch (error) {
        // The BEGIN never happened: nothing is left to end, so other flows may go on (unless a newer start claimed).
        if (internals.transactionDepth === 0) isolation.release(claimed);
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
    const depth = internals.transactionDepth;
    if (depth !== 1) {
      try {
        return await end();
      } finally {
        // A failed savepoint rollback can reset the runner (rollbackOrReset): then nothing is left to own.
        if (depth > 1 && internals.transactionDepth === 0) isolation.release();
      }
    }
    return gated(
      (gate) => (ending = gate),
      end,
      () => {
        if (internals.transactionDepth === 0) isolation.release();
      },
    );
  };
  // Whether SQLite still has a transaction open: BEGIN fails inside one. Without one, it begins and ends a deferred one.
  const transactionLive = () =>
    query('BEGIN').then(
      () => query('ROLLBACK').then(noTransaction, noTransaction),
      () => true,
    );
  // A failed ROLLBACK leaves TypeORM's depth unchanged. Then the outermost end never reaches depth 0, and this flow
  // would own the connection forever. Bring the depth back in line with SQLite instead:
  // - SQLite discards the whole transaction on its own for some errors (SQLITE_FULL, SQLITE_IOERR, OR ROLLBACK,
  //   RAISE(ROLLBACK)). After a failed outermost ROLLBACK, or when no transaction is left, end whatever is left and
  //   reset the runner. The caller's later statements then run on their own, as they would on a plain connection.
  // - A failed savepoint rollback inside a live transaction (a subscriber threw, or the savepoint is gone) rolls back
  //   to the savepoint if it still exists and counts the level as ended, so the outer transaction goes on.
  const rollbackOrReset = async () => {
    const depth = internals.transactionDepth;
    try {
      await rollbackTransaction();
    } catch (error) {
      if (depth > 0 && internals.transactionDepth === depth) {
        if (depth > 1 && (await transactionLive())) {
          await query(`ROLLBACK TO SAVEPOINT typeorm_${depth - 1}`).catch(() => undefined);
          internals.transactionDepth = depth - 1;
        } else {
          await query('ROLLBACK').catch(() => undefined);
          internals.transactionDepth = 0;
          active = false;
        }
      }
      throw error;
    }
  };
  // If the outermost COMMIT fails, roll back while the gate is still closed. The caller's own rollback then finds no
  // transaction, and TypeORM's callers ignore that error.
  const commitOrRollBack = async () => {
    try {
      await commitTransaction();
    } catch (error) {
      if (active && internals.transactionDepth === 1) {
        await rollbackOrReset().catch(() => undefined);
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
  // startTransaction already set isTransactionActive, so leave it. This skips the rollback subscriber events. Another
  // flow's rollback does nothing: after its start timed out, a caller's catch rolls back and rethrows SQLITE_BUSY.
  runner.rollbackTransaction = async () => {
    if (isForeign(flows.getStore())) return;
    if (!active || internals.transactionDepth > 0) return endTransaction(rollbackOrReset);
    if (!starting) active = false;
  };
  return runner;
}

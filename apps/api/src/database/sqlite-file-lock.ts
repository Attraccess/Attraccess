import { resolve } from 'node:path';

/** A guarded connection's claim on its database file's write lock. Compared by reference. */
export type FileLockHolder = object;

type Waiter = { holder: FileLockHolder; wake: () => void; timer: NodeJS.Timeout };

type FileLock = { holder?: FileLockHolder; queue: Waiter[] };

/** Per database file (resolved path): who may write, and who waits for it in arrival order. */
const fileLocks = new Map<string, FileLock>();

/**
 * The key all guarded connections to the same database file share, or undefined for a database that no other
 * connection can open (in-memory, temporary).
 */
export function fileLockKey(database: unknown): string | undefined {
  if (typeof database !== 'string' || database === '' || database === ':memory:') return undefined;
  if (database.startsWith('file:')) return undefined;
  return resolve(database);
}

const busyError = (timeout: number) =>
  Object.assign(
    new Error(
      `SQLITE_BUSY: waited ${timeout} ms for another connection's write transaction on this database file to end`,
    ),
    { code: 'SQLITE_BUSY' },
  );

/**
 * An async stand-in for SQLite's write lock, shared by the guarded connections of this process to one file.
 *
 * better-sqlite3 is synchronous: a statement that finds another connection's write lock busy-waits (busy_timeout) on
 * the event loop, so the connection holding the lock can never run its next statement or COMMIT. Both then stall until
 * the timeout and the waiter fails with SQLITE_BUSY. Taking this lock before SQLite's lets the waiter yield instead:
 * it waits asynchronously, in arrival order, at most `timeout` ms, then rejects with code SQLITE_BUSY without having
 * touched the database. Reentrant per holder: a holder that already has it gets it at once.
 */
export async function acquireFileLock(key: string, holder: FileLockHolder, timeout: number): Promise<void> {
  let lock = fileLocks.get(key);
  if (!lock) fileLocks.set(key, (lock = { queue: [] }));
  if (lock.holder === holder) return;
  if (lock.holder === undefined && lock.queue.length === 0) {
    lock.holder = holder;
    return;
  }
  const queued = lock;
  await new Promise<void>((wake, reject) => {
    const waiter: Waiter = {
      holder,
      wake,
      timer: setTimeout(() => {
        queued.queue.splice(queued.queue.indexOf(waiter), 1);
        reject(busyError(timeout));
      }, timeout),
    };
    queued.queue.push(waiter);
  });
}

/** Hands the lock to the next waiter. Does nothing unless `holder` holds it. */
export function releaseFileLock(key: string, holder: FileLockHolder): void {
  const lock = fileLocks.get(key);
  if (!lock || lock.holder !== holder) return;
  const next = lock.queue.shift();
  lock.holder = next?.holder;
  if (next) {
    clearTimeout(next.timer);
    next.wake();
  } else fileLocks.delete(key);
}

/** Whether `holder` holds the lock of `key`. */
export function holdsFileLock(key: string, holder: FileLockHolder): boolean {
  return fileLocks.get(key)?.holder === holder;
}

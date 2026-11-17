import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { createDataSource } from './sqlite-connection';
import { sqliteErrorCode } from './sqlite-errors';

const BUSY_TIMEOUT_MS = 1500;

const defer = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * better-sqlite3 runs statements synchronously: a statement that meets another connection's write lock busy-waits on
 * the event loop, so the lock holder never gets to COMMIT and the waiter fails with SQLITE_BUSY after the timeout.
 * Guarded connections to one file therefore share an asynchronous write lock (sqlite-file-lock).
 */
describe('SQLite write lock shared by guarded connections to one file', () => {
  let directory: string;
  let first: DataSource;
  let second: DataSource;

  const open = (timeout = BUSY_TIMEOUT_MS) =>
    createDataSource({ type: 'better-sqlite3', database: join(directory, 'test.sqlite'), timeout }).initialize();
  const values = () => first.query('SELECT id, value FROM counter ORDER BY id');

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sqlite-file-lock-'));
    first = await open();
    second = await open();
    await first.query('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
    await first.query('INSERT INTO counter VALUES (1, 0), (2, 0)');
  });

  afterEach(async () => {
    for (const source of [first, second]) if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('runs concurrent write transactions on two connections one after the other, without SQLITE_BUSY', async () => {
    const startedAt = Date.now();
    const write = (source: DataSource, id: number) =>
      source.transaction(async (manager) => {
        for (let step = 0; step < 5; step++) {
          await manager.query('UPDATE counter SET value = value + 1 WHERE id = ?', [id]);
          await pause(5);
        }
      });

    await expect(Promise.all([write(first, 1), write(second, 2), write(first, 2), write(second, 1)])).resolves.toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    expect(Date.now() - startedAt).toBeLessThan(BUSY_TIMEOUT_MS);
    expect(await values()).toEqual([
      { id: 1, value: 10 },
      { id: 2, value: 10 },
    ]);
  });

  it('lets an autocommit write on one connection wait for the other connection’s transaction', async () => {
    const holding = defer();
    const release = defer();
    const events: string[] = [];
    const transaction = first.transaction(async (manager) => {
      await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
      holding.resolve();
      await release.promise;
      events.push('commit');
    });
    await holding.promise;
    const write = second.query('UPDATE counter SET value = 2 WHERE id = 2').then(() => events.push('write'));
    await pause(50);
    expect(events).toEqual([]);
    release.resolve();

    await Promise.all([transaction, write]);
    expect(events).toEqual(['commit', 'write']);
    expect(await values()).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 2 },
    ]);
  });

  it('reads on another connection while a transaction holds the lock, seeing only committed data', async () => {
    const holding = defer();
    const release = defer();
    const transaction = first.transaction(async (manager) => {
      await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
      holding.resolve();
      await release.promise;
    });
    await holding.promise;
    expect(await second.query('SELECT value FROM counter WHERE id = 1')).toEqual([{ value: 0 }]);
    release.resolve();
    await transaction;
    expect(await second.query('SELECT value FROM counter WHERE id = 1')).toEqual([{ value: 1 }]);
  });

  it('fails a waiter with SQLITE_BUSY after the busy timeout, leaving the holder and both connections usable', async () => {
    await second.destroy();
    second = await open(100);
    const holding = defer();
    const release = defer();
    const transaction = first.transaction(async (manager) => {
      await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
      holding.resolve();
      await release.promise;
    });
    await holding.promise;

    const startedAt = Date.now();
    const waiters = await Promise.allSettled([
      second.transaction((manager) => manager.query('UPDATE counter SET value = 5 WHERE id = 2')),
      second.query('UPDATE counter SET value = 6 WHERE id = 2'),
    ]);
    expect(Date.now() - startedAt).toBeLessThan(BUSY_TIMEOUT_MS);
    expect(waiters.map((outcome) => outcome.status === 'rejected' && sqliteErrorCode(outcome.reason))).toEqual([
      'SQLITE_BUSY',
      'SQLITE_BUSY',
    ]);

    release.resolve();
    await transaction;
    await second.transaction((manager) => manager.query('UPDATE counter SET value = 7 WHERE id = 2'));
    await first.query('UPDATE counter SET value = value + 1 WHERE id = 1');
    expect(await values()).toEqual([
      { id: 1, value: 2 },
      { id: 2, value: 7 },
    ]);
  });

  it('hands the lock on after a rolled-back transaction and after a failed write', async () => {
    await expect(
      first.transaction(async (manager) => {
        await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    await expect(first.query('INSERT INTO counter VALUES (1, 9)')).rejects.toThrow('UNIQUE');

    await second.transaction((manager) => manager.query('UPDATE counter SET value = 3 WHERE id = 2'));
    expect(await values()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 3 },
    ]);
  });

  it('serves waiting writers of several connections in arrival order', async () => {
    const third = await open();
    try {
      const holding = defer();
      const release = defer();
      const order: string[] = [];
      const transaction = first.transaction(async (manager) => {
        await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
        holding.resolve();
        await release.promise;
      });
      await holding.promise;
      const writes = [
        second.query('UPDATE counter SET value = value * 10 WHERE id = 1').then(() => order.push('second')),
        third.query('UPDATE counter SET value = value + 1 WHERE id = 1').then(() => order.push('third')),
      ];
      await pause(20);
      release.resolve();
      await Promise.all([transaction, ...writes]);
      expect(order).toEqual(['second', 'third']);
      expect(await values()).toEqual([
        { id: 1, value: 11 },
        { id: 2, value: 0 },
      ]);
    } finally {
      await third.destroy();
    }
  });
});

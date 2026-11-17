import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { closeResourceTransactionConnection, runSerializedTransaction } from './run-serialized-transaction';
import { createDataSource } from './sqlite-connection';

const BUSY_TIMEOUT_MS = 1500;

const defer = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A resource-lifecycle transaction (runSerializedTransaction) holds SQLite's write lock from its BEGIN IMMEDIATE on.
 * Work inside it that still uses the main connection (an injected repository instead of the transaction's manager)
 * used to queue behind a main-connection write of another request, which waited for that same lock: both waited out
 * the busy timeout, the other request failed with SQLITE_BUSY (503) and the lifecycle step stalled (Attractap HIL,
 * reader session start plus a REST poll whose session lookup updated lastAccessedAt).
 */
describe('SQLite statements on the main connection inside a resource-lifecycle transaction', () => {
  let directory: string;
  let source: DataSource;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sqlite-cross-connection-'));
    source = await createDataSource({
      type: 'sqlite',
      database: join(directory, 'test.sqlite'),
      busyTimeout: BUSY_TIMEOUT_MS,
    }).initialize();
    await source.query('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
    await source.query('INSERT INTO counter VALUES (1, 0), (2, 0)');
    // Open the dedicated connection up front, as a running API has.
    await runSerializedTransaction(source.manager, async () => undefined);
  });

  afterEach(async () => {
    await closeResourceTransactionConnection(source);
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('does not wait for a main-connection write that waits for the lifecycle transaction', async () => {
    const lifecycleStarted = defer();
    const otherWriteQueued = defer();
    const startedAt = Date.now();
    const lifecycle = runSerializedTransaction(source.manager, async (manager) => {
      await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
      lifecycleStarted.resolve();
      await otherWriteQueued.promise;
      // The main connection, not the transaction's manager: sees the transaction's own write.
      return source.query('SELECT value FROM counter WHERE id = 1');
    });
    await lifecycleStarted.promise;
    // Another request's write on the main connection (outside the lifecycle work's async context).
    const otherWrite = source.query('UPDATE counter SET value = 5 WHERE id = 2');
    await pause(50);
    otherWriteQueued.resolve();

    const outcomes = await Promise.allSettled([lifecycle, otherWrite]);
    expect(outcomes).toEqual([
      { status: 'fulfilled', value: [{ value: 1 }] },
      expect.objectContaining({ status: 'fulfilled' }),
    ]);
    expect(Date.now() - startedAt).toBeLessThan(BUSY_TIMEOUT_MS / 2);
    expect(await source.query('SELECT id, value FROM counter ORDER BY id')).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 5 },
    ]);
  });

  it('does not wait for a main-connection transaction whose BEGIN waits for the lifecycle transaction', async () => {
    const lifecycleStarted = defer();
    const otherTransactionQueued = defer();
    const startedAt = Date.now();
    const lifecycle = runSerializedTransaction(source.manager, async (manager) => {
      await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
      lifecycleStarted.resolve();
      await otherTransactionQueued.promise;
      return source.query('SELECT value FROM counter WHERE id = 1');
    });
    await lifecycleStarted.promise;
    const otherTransaction = source.transaction((manager) =>
      manager.query('UPDATE counter SET value = 5 WHERE id = 2'),
    );
    await pause(50);
    otherTransactionQueued.resolve();

    const outcomes = await Promise.allSettled([lifecycle, otherTransaction]);
    expect(outcomes).toEqual([
      { status: 'fulfilled', value: [{ value: 1 }] },
      expect.objectContaining({ status: 'fulfilled' }),
    ]);
    expect(Date.now() - startedAt).toBeLessThan(BUSY_TIMEOUT_MS / 2);
  });

  it('runs a main-connection write inside the lifecycle transaction, so it rolls back with it', async () => {
    const failure = new Error('lifecycle step failed');
    await expect(
      runSerializedTransaction(source.manager, async (manager) => {
        await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
        await source.query('UPDATE counter SET value = 7 WHERE id = 2');
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await source.query('SELECT id, value FROM counter ORDER BY id')).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 0 },
    ]);
  });

  it('leaves main-connection statements after the lifecycle transaction on the main connection', async () => {
    await runSerializedTransaction(source.manager, (manager) => manager.query('UPDATE counter SET value = 1'));
    await source.query('UPDATE counter SET value = 2 WHERE id = 1');
    expect(await source.query('SELECT value FROM counter WHERE id = 1')).toEqual([{ value: 2 }]);
  });
});

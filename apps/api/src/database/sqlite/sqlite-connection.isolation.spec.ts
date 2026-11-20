import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntitySchema } from 'typeorm';
import { closeResourceTransactionConnection, runSerializedTransaction } from './run-serialized-transaction';
import { createDataSource } from './sqlite-connection';

type Counter = { id: number; value: number };
const CounterEntity = new EntitySchema<Counter>({
  name: 'Counter',
  tableName: 'counter',
  columns: { id: { type: Number, primary: true }, value: { type: Number } },
});

type Note = { id?: number; text: string | null };
const NoteEntity = new EntitySchema<Note>({
  name: 'Note',
  tableName: 'note',
  columns: { id: { type: Number, primary: true, generated: 'increment' }, text: { type: String, nullable: false } },
});

const defer = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('main SQLite connection transaction isolation', () => {
  let directory: string;
  let source: DataSource;

  const open = (busyTimeout?: number) =>
    createDataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: join(directory, 'test.sqlite'),
      entities: [CounterEntity, NoteEntity],
      ...(busyTimeout ? { timeout: busyTimeout } : {}),
    }).initialize();
  const values = () => source.query('SELECT id, value FROM counter ORDER BY id');
  // isTransactionActive reads false for every flow but the owner, so also check that a fresh flow is not kept waiting.
  const runnerState = async () => {
    const runner = source.createQueryRunner();
    const read = source.query('SELECT 1');
    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<boolean>((resolve) => (timer = setTimeout(resolve, 1000, false)));
    const free = await Promise.race([read.then(() => true), waited]).finally(() => clearTimeout(timer));
    read.catch(() => undefined);
    return [runner.isTransactionActive, (runner as unknown as { transactionDepth: number }).transactionDepth, free];
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'main-sqlite-isolation-'));
    source = await open();
    await source.query('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
    await source.query('INSERT INTO counter VALUES (1, 0), (2, 0), (3, 0)');
    await source.query('CREATE TABLE note (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)');
  });

  afterEach(async () => {
    await closeResourceTransactionConnection(source);
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps another flow’s save() when the open transaction rolls back', async () => {
    const opened = defer();
    const fail = defer();
    const repository = source.getRepository(CounterEntity);
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 10 });
      opened.resolve();
      await fail.promise;
      throw new Error('A fails');
    });
    const outcome = expect(a).rejects.toThrow('A fails');
    await opened.promise;
    const c = repository.save({ id: 2, value: 20 });
    await pause(50);
    fail.resolve();
    await outcome;

    await expect(c).resolves.toEqual({ id: 2, value: 20 });
    expect(await values()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 20 },
      { id: 3, value: 0 },
    ]);
    expect(await runnerState()).toEqual([false, 0, true]);
  });

  it('does not commit another flow’s partly failed save() with the open transaction', async () => {
    const opened = defer();
    const finish = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 10 });
      opened.resolve();
      await finish.promise;
    });
    await opened.promise;
    // Generated ids: save() decides about its own transaction before its first statement, while A is open. The second
    // note violates NOT NULL, so the first must roll back with it instead of autocommitting or joining A.
    const c = source.getRepository(NoteEntity).save([{ text: 'kept only with the second' }, { text: null }]);
    const cOutcome = expect(c).rejects.toThrow();
    finish.resolve();
    await a;
    await cOutcome;

    expect(await source.query('SELECT * FROM note')).toEqual([]);
    expect((await values())[0]).toEqual({ id: 1, value: 10 });
  });

  it('keeps the other flow’s data when A throws', async () => {
    const aOpened = defer();
    const release = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      aOpened.resolve();
      await release.promise;
      throw new Error('A fails');
    });
    const aOutcome = expect(a).rejects.toThrow('A fails');
    await aOpened.promise;
    const b = source.transaction((manager) => manager.update(CounterEntity, { id: 2 }, { value: 2 }));
    await pause(50);
    // B has not started inside A's transaction: A's end decides only A's data.
    release.resolve();
    await Promise.all([aOutcome, b]);

    expect(await values()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 2 },
      { id: 3, value: 0 },
    ]);
    expect(await runnerState()).toEqual([false, 0, true]);
  });

  it('keeps the committed flow’s data when a later flow’s transaction fails after it', async () => {
    const aOpened = defer();
    const releaseA = defer();
    const bWrote = defer();
    const releaseB = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      aOpened.resolve();
      await releaseA.promise;
    });
    await aOpened.promise;
    const b = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 2 }, { value: 2 });
      bWrote.resolve();
      await releaseB.promise;
      throw new Error('B fails');
    });
    const bOutcome = expect(b).rejects.toThrow('B fails');
    // Nested in A (the old behaviour), B would write now and A's commit would keep B's write.
    await Promise.race([bWrote.promise, pause(50)]);
    releaseA.resolve();
    await a;
    releaseB.resolve();
    await bOutcome;

    expect(await values()).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 0 },
      { id: 3, value: 0 },
    ]);
    expect(await runnerState()).toEqual([false, 0, true]);
  });

  it('runs 16 concurrent read-modify-write transactions without lost updates, repeatedly', async () => {
    for (let round = 1; round <= 20; round++) {
      await Promise.all(
        Array.from({ length: 16 }, () =>
          source.transaction(async (manager) => {
            const { value } = await manager.findOneByOrFail(CounterEntity, { id: 1 });
            await manager.update(CounterEntity, { id: 1 }, { value: value + 1 });
          }),
        ),
      );
      expect(await source.query('SELECT value FROM counter WHERE id = 1')).toEqual([{ value: round * 16 }]);
    }
    expect(await runnerState()).toEqual([false, 0, true]);
  });

  it('keeps savepoints for the owner’s nested transactions and saves', async () => {
    const statements: string[] = [];
    source.subscribers.push({ beforeQuery: ({ query }) => void statements.push(query) });
    await source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      await manager.transaction((nested) => nested.save(CounterEntity, { id: 2, value: 2 }));
      await expect(
        manager.transaction(async (nested) => {
          await nested.save(CounterEntity, { id: 3, value: 3 });
          throw new Error('Inner fails');
        }),
      ).rejects.toThrow('Inner fails');
    });

    expect(statements.filter((query) => /^(BEGIN|SAVEPOINT|ROLLBACK|COMMIT|RELEASE)/.test(query))).toEqual([
      'BEGIN IMMEDIATE TRANSACTION',
      'SAVEPOINT typeorm_1',
      'RELEASE SAVEPOINT typeorm_1',
      'SAVEPOINT typeorm_1',
      'ROLLBACK TO SAVEPOINT typeorm_1',
      'COMMIT',
    ]);
    expect(await values()).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 2 },
      { id: 3, value: 0 },
    ]);
  });

  it('lets the owner use the root DataSource and repositories inside its transaction without waiting', async () => {
    await expect(
      source.transaction(async () => {
        await source.query('UPDATE counter SET value = 5 WHERE id = 1');
        await source.getRepository(CounterEntity).save({ id: 2, value: 6 });
        await source.manager.transaction((nested) => nested.update(CounterEntity, { id: 3 }, { value: 7 }));
        throw new Error('Roll everything back');
      }),
    ).rejects.toThrow('Roll everything back');

    // A self-wait would have failed them with SQLITE_BUSY. They ran inside the transaction, so they rolled back with it.
    expect(await values()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 0 },
      { id: 3, value: 0 },
    ]);
  });

  it('makes other flows’ reads wait and see only committed data', async () => {
    const opened = defer();
    const finish = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 10 });
      opened.resolve();
      await finish.promise;
    });
    await opened.promise;
    let read: Counter[] | undefined;
    const c = source
      .getRepository(CounterEntity)
      .find({ where: { id: 1 } })
      .then((rows) => (read = rows));
    await pause(50);
    expect(read).toBeUndefined();
    finish.resolve();
    await Promise.all([a, c]);
    expect(read).toEqual([{ id: 1, value: 10 }]);
  });

  it('serves waiting flows in arrival order', async () => {
    const opened = defer();
    const finish = defer();
    const order: number[] = [];
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      opened.resolve();
      await finish.promise;
    });
    await opened.promise;
    const waiting = [1, 2, 3, 4].map((n) => source.transaction(async () => void order.push(n)));
    await pause(20);
    finish.resolve();
    await Promise.all([a, ...waiting]);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('fails work another async context issues for a transaction after the busy timeout, which then still commits', async () => {
    await source.destroy();
    source = await open(150);
    // Created outside the transaction's async context, so it is another flow's statement.
    const go = defer();
    const outside = go.promise.then(() => source.query('SELECT 1 AS one'));
    const outsideFailure = outside.catch((error: unknown) => error);

    await source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 4 });
      const started = Date.now();
      go.resolve();
      const error = (await outsideFailure) as { code?: string; message?: string };
      // Rejected after the busy timeout, not at once and not much later.
      expect(Date.now() - started).toBeGreaterThanOrEqual(140);
      expect(Date.now() - started).toBeLessThan(2000);
      expect(error.code).toBe('SQLITE_BUSY');
      expect(error.message).toContain("another flow's transaction");
      await manager.update(CounterEntity, { id: 1 }, { value: 5 });
    });

    expect((await values())[0]).toEqual({ id: 1, value: 5 });
    expect(await runnerState()).toEqual([false, 0, true]);
    await source.getRepository(CounterEntity).save({ id: 2, value: 9 });
  });

  it('rejects a transaction start that waited too long without touching the owner’s transaction', async () => {
    await source.destroy();
    source = await open(100);
    const opened = defer();
    const finish = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      opened.resolve();
      await finish.promise;
    });
    await opened.promise;
    await expect(
      source.transaction((manager) => manager.update(CounterEntity, { id: 2 }, { value: 2 })),
    ).rejects.toMatchObject({ code: 'SQLITE_BUSY' });
    await expect(source.getRepository(CounterEntity).save({ id: 3, value: 3 })).rejects.toMatchObject({
      code: 'SQLITE_BUSY',
    });
    finish.resolve();
    await a;

    expect(await values()).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 0 },
      { id: 3, value: 0 },
    ]);
    expect(await runnerState()).toEqual([false, 0, true]);
    await source.getRepository(CounterEntity).save({ id: 2, value: 8 });
  });

  it('survives the save() and transaction() overlap with a serialized writer 40 times', async () => {
    for (let i = 0; i < 40; i++) {
      let release!: () => void;
      let entered!: () => void;
      const writerEntered = new Promise<void>((resolve) => (entered = resolve));
      const writerRelease = new Promise<void>((resolve) => (release = resolve));
      const holder = runSerializedTransaction(source.manager, async (manager) => {
        await manager.query('UPDATE counter SET value = value + 1 WHERE id = 3');
        entered();
        await writerRelease;
      });
      await writerEntered;
      const save = source.getRepository(CounterEntity).save({ id: 2, value: i });
      const write = source.transaction(async (manager) => {
        const { value } = await manager.findOneByOrFail(CounterEntity, { id: 1 });
        await manager.update(CounterEntity, { id: 1 }, { value: value + 1 });
      });
      setTimeout(release, 5);
      await Promise.all([holder, save, write]);
      expect(await runnerState()).toEqual([false, 0, true]);
    }
    expect(await values()).toEqual([
      { id: 1, value: 40 },
      { id: 2, value: 39 },
      { id: 3, value: 40 },
    ]);
  });
});

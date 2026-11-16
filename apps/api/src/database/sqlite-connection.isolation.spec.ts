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
      type: 'sqlite',
      database: join(directory, 'test.sqlite'),
      entities: [CounterEntity],
      ...(busyTimeout ? { busyTimeout } : {}),
    }).initialize();
  const values = () => source.query('SELECT id, value FROM counter ORDER BY id');
  const runnerState = () => {
    const runner = source.createQueryRunner();
    return [runner.isTransactionActive, (runner as unknown as { transactionDepth: number }).transactionDepth];
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'main-sqlite-isolation-'));
    source = await open();
    await source.query('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
    await source.query('INSERT INTO counter VALUES (1, 0), (2, 0), (3, 0)');
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
    expect(runnerState()).toEqual([false, 0]);
  });

  it('does not commit another flow’s partly failed write with the open transaction', async () => {
    const opened = defer();
    const finish = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 10 });
      opened.resolve();
      await finish.promise;
    });
    await opened.promise;
    // The second row violates the primary key: the whole save must roll back, not leave row 2 in A's commit.
    const c = source.getRepository(CounterEntity).insert([
      { id: 2, value: 20 },
      { id: 3, value: 30 },
      { id: 3, value: 31 },
    ]);
    const cOutcome = expect(c).rejects.toThrow();
    await pause(50);
    finish.resolve();
    await a;
    await cOutcome;

    expect(await values()).toEqual([
      { id: 1, value: 10 },
      { id: 2, value: 0 },
      { id: 3, value: 0 },
    ]);
  });

  it.each([
    ['A throws', true],
    ['B throws', false],
  ])('keeps the other flow’s data when %s', async (_name, aFails) => {
    const aOpened = defer();
    const release = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      aOpened.resolve();
      await release.promise;
      if (aFails) throw new Error('A fails');
    });
    const aOutcome = aFails ? expect(a).rejects.toThrow('A fails') : a;
    await aOpened.promise;
    const b = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 2 }, { value: 2 });
      if (!aFails) throw new Error('B fails');
    });
    const bOutcome = aFails ? b : expect(b).rejects.toThrow('B fails');
    await pause(50);
    // B has not started inside A's transaction: A's end decides only A's data.
    release.resolve();
    await Promise.all([aOutcome, bOutcome]);

    expect(await values()).toEqual(
      aFails
        ? [
            { id: 1, value: 0 },
            { id: 2, value: 2 },
            { id: 3, value: 0 },
          ]
        : [
            { id: 1, value: 1 },
            { id: 2, value: 0 },
            { id: 3, value: 0 },
          ],
    );
    expect(runnerState()).toEqual([false, 0]);
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
    expect(runnerState()).toEqual([false, 0]);
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
    const started = Date.now();
    await expect(
      source.transaction(async () => {
        await source.query('UPDATE counter SET value = 5 WHERE id = 1');
        await source.getRepository(CounterEntity).save({ id: 2, value: 6 });
        await source.manager.transaction((nested) => nested.update(CounterEntity, { id: 3 }, { value: 7 }));
        throw new Error('Roll everything back');
      }),
    ).rejects.toThrow('Roll everything back');

    expect(Date.now() - started).toBeLessThan(2000);
    // They ran inside the transaction, so they rolled back with it.
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
      go.resolve();
      const error = (await outsideFailure) as { code?: string; message?: string };
      expect(error.code).toBe('SQLITE_BUSY');
      expect(error.message).toContain("another flow's transaction");
      await manager.update(CounterEntity, { id: 1 }, { value: 5 });
    });

    expect((await values())[0]).toEqual({ id: 1, value: 5 });
    expect(runnerState()).toEqual([false, 0]);
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
    expect(runnerState()).toEqual([false, 0]);
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
      expect(runnerState()).toEqual([false, 0]);
    }
    expect(await values()).toEqual([
      { id: 1, value: 40 },
      { id: 2, value: 39 },
      { id: 3, value: 40 },
    ]);
  });
});

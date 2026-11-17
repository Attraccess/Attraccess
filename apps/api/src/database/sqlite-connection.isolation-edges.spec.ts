import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager, EntitySchema, TransactionNotStartedError } from 'typeorm';
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

describe('main SQLite connection transaction isolation: edge cases', () => {
  let directory: string;
  let source: DataSource;

  const open = (busyTimeout = 300) =>
    createDataSource({
      type: 'better-sqlite3',
      database: join(directory, 'test.sqlite'),
      entities: [CounterEntity, NoteEntity],
      timeout: busyTimeout,
    }).initialize();
  const values = () => source.query('SELECT id, value FROM counter ORDER BY id');
  /** No flow owns the connection any more: another flow's transaction runs, not failing after the busy timeout. */
  const expectFree = async () => {
    await source.transaction((manager) => manager.update(CounterEntity, { id: 3 }, { value: 33 }));
    const runner = source.createQueryRunner() as unknown as { transactionDepth: number };
    expect(runner.transactionDepth).toBe(0);
  };
  /** Runs `work` from the async context of a transaction that has committed meanwhile (a stale flow). */
  const fromEndedTransaction = async <T>(work: (manager: EntityManager) => Promise<T>) => {
    let later!: () => Promise<T>;
    await source.transaction(async (manager) => {
      const go = defer();
      const chained = go.promise.then(() => work(manager));
      later = () => (go.resolve(), chained);
    });
    return later();
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'main-sqlite-isolation-edges-'));
    source = await open();
    await source.query('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
    await source.query('INSERT INTO counter VALUES (1, 0), (2, 0), (3, 0)');
    await source.query('CREATE TABLE note (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)');
  });

  afterEach(async () => {
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('frees the connection when SQLite already rolled the transaction back and the ROLLBACK fails', async () => {
    await expect(
      source.transaction(async (manager) => {
        await manager.query('UPDATE counter SET value = 7 WHERE id = 2');
        await manager.query('INSERT OR ROLLBACK INTO counter VALUES (1, 5)');
      }),
    ).rejects.toThrow(/UNIQUE/);

    await expectFree();
    expect(await values()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 0 },
      { id: 3, value: 33 },
    ]);
  });

  it('frees the connection when SQLite rolled back under a savepoint, and fails the outer transaction', async () => {
    await expect(
      source.transaction(async (manager) => {
        await manager.query('UPDATE counter SET value = 7 WHERE id = 2');
        await expect(
          manager.transaction((nested) => nested.query('INSERT OR ROLLBACK INTO counter VALUES (1, 5)')),
        ).rejects.toThrow(/UNIQUE/);
      }),
    ).rejects.toThrow(TransactionNotStartedError);

    await expectFree();
    expect((await values())[1]).toEqual({ id: 2, value: 0 });
  });

  it('keeps the outer transaction when a savepoint rollback fails while it is live', async () => {
    let armed = true;
    source.subscribers.push({
      beforeTransactionRollback: ({ queryRunner }: { queryRunner: { transactionDepth: number } }) => {
        if (armed && queryRunner.transactionDepth > 1) {
          armed = false;
          throw new Error('Subscriber fails');
        }
      },
    } as never);
    await source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      await expect(
        manager.transaction(async (nested) => {
          await nested.update(CounterEntity, { id: 2 }, { value: 2 });
          throw new Error('Inner fails');
        }),
      ).rejects.toThrow('Inner fails');
      await manager.update(CounterEntity, { id: 3 }, { value: 3 });
    });

    expect(await values()).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 0 },
      { id: 3, value: 3 },
    ]);
    await expectFree();
  });

  it('frees the connection after the owner ran nested transactions concurrently and one failed', async () => {
    // The savepoints of the two nested transactions interleave differently from run to run.
    for (let round = 0; round < 10; round++) {
      await source
        .transaction(async (manager) => {
          await manager.update(CounterEntity, { id: 1 }, { value: 1 });
          await Promise.allSettled([
            manager.transaction(async (nested) => {
              await nested.update(CounterEntity, { id: 2 }, { value: 2 });
              await pause(round % 3);
              throw new Error('Inner fails');
            }),
            manager.transaction((nested) => nested.update(CounterEntity, { id: 3 }, { value: 3 })),
          ]);
        })
        .catch(() => undefined);

      await expectFree();
    }
  });

  it('lets a nested transaction forked without being awaited end the transaction its call outlived', async () => {
    const gate = defer();
    let forked!: Promise<unknown>;
    await source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      forked = manager.transaction(async (nested) => {
        await nested.update(CounterEntity, { id: 2 }, { value: 2 });
        await gate.promise;
        await nested.update(CounterEntity, { id: 3 }, { value: 3 });
      });
      await pause(20);
    });

    // The outer COMMIT only released the fork's savepoint: the transaction stays open while the fork runs.
    await expect(source.query('SELECT 1')).rejects.toMatchObject({ code: 'SQLITE_BUSY' });
    gate.resolve();
    await forked;
    await expectFree();
    expect(await values()).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 2 },
      { id: 3, value: 33 },
    ]);
  });

  it('fails the call when committing a transaction it outlived fails', async () => {
    await source.query(
      'CREATE TABLE child (id INTEGER PRIMARY KEY, parent INTEGER REFERENCES counter(id) DEFERRABLE INITIALLY DEFERRED)',
    );
    await expect(
      source.transaction(async (manager) => {
        await manager.query('INSERT INTO child VALUES (1, 99)');
        // Leave one level open that no call will end, as concurrent nested transactions of one flow can: the outer
        // COMMIT then only releases this savepoint.
        await manager.query('SAVEPOINT typeorm_1');
        (manager.queryRunner as unknown as { transactionDepth: number }).transactionDepth++;
      }),
    ).rejects.toThrow(/FOREIGN KEY/);

    expect(await source.query('SELECT * FROM child')).toEqual([]);
    await expectFree();
  });

  it('keeps a newer start’s ownership when an earlier start of the same flow fails', async () => {
    let later!: () => Promise<string[]>;
    const finish = defer();
    await source.transaction(async () => {
      const go = defer();
      const chained = go.promise.then(async () => {
        const runner = source.createQueryRunner();
        const starts = await Promise.all(
          [runner.startTransaction(), runner.startTransaction()].map((start) =>
            start.then(
              () => 'ok',
              (error: Error) => error.message,
            ),
          ),
        );
        await runner.query('UPDATE counter SET value = 99 WHERE id = 1');
        await finish.promise;
        await runner.rollbackTransaction();
        return starts;
      });
      later = () => (go.resolve(), chained);
    });
    let armed = true;
    source.subscribers.push({
      beforeTransactionStart: () => {
        if (armed) {
          armed = false;
          throw new Error('Start fails');
        }
      },
    } as never);
    const work = later();
    await pause(50);
    // The surviving start still owns the connection: another flow neither reads its uncommitted write nor runs.
    await expect(source.query('SELECT value FROM counter WHERE id = 1')).rejects.toMatchObject({ code: 'SQLITE_BUSY' });
    finish.resolve();

    expect(await work).toEqual(['Start fails', 'ok']);
    expect((await values())[0]).toEqual({ id: 1, value: 0 });
    await expectFree();
  });

  it('does not let another flow end the owner’s transaction', async () => {
    const opened = defer();
    const finish = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      opened.resolve();
      await finish.promise;
    });
    await opened.promise;
    const foreign = source.createQueryRunner();
    await foreign.rollbackTransaction();
    await expect(foreign.commitTransaction()).rejects.toThrow(TransactionNotStartedError);
    finish.resolve();
    await a;

    expect((await values())[0]).toEqual({ id: 1, value: 1 });
    await expectFree();
  });

  it.each(['save', 'remove'] as const)(
    'keeps two concurrent %s() calls from the context of an ended transaction apart',
    async (method) => {
      const gate = defer();
      source.subscribers.push({ listenTo: () => 'Note', beforeInsert: () => gate.promise } as never);
      const [bad, ok] = await fromEndedTransaction(async () => {
        const bad = source.getRepository(NoteEntity).save([{ text: 'a' }, { text: null }]);
        await pause(10);
        const repository = source.getRepository(CounterEntity);
        const ok = method === 'save' ? repository.save({ id: 2, value: 20 }) : repository.remove({ id: 2, value: 0 });
        await Promise.race([ok.catch(() => undefined), pause(100)]);
        gate.resolve();
        return Promise.allSettled([bad, ok]);
      });

      expect(bad.status).toBe('rejected');
      expect(ok.status).toBe('fulfilled');
      expect(await source.query('SELECT id, value FROM counter WHERE id = 2')).toEqual(
        method === 'save' ? [{ id: 2, value: 20 }] : [],
      );
      expect(await source.query('SELECT * FROM note')).toEqual([]);
    },
  );

  it('gives transactions on an escaped transactional manager a flow of their own', async () => {
    const [failed, kept] = await fromEndedTransaction((escaped) =>
      Promise.allSettled([
        escaped.transaction(async (manager) => {
          await manager.update(CounterEntity, { id: 2 }, { value: 20 });
          await pause(20);
          throw new Error('First fails');
        }),
        escaped.transaction((manager) => manager.update(CounterEntity, { id: 3 }, { value: 30 })),
      ]),
    );

    expect(failed.status).toBe('rejected');
    expect(kept.status).toBe('fulfilled');
    expect(await values()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 0 },
      { id: 3, value: 30 },
    ]);
  });

  it('isolates other flows from a direct runner.startTransaction() without context', async () => {
    const go = defer();
    let read: unknown;
    // Created before the transaction, so it belongs to another flow.
    const other = go.promise.then(() =>
      source.transaction(async (manager) => (read = await manager.query('SELECT value FROM counter WHERE id = 1'))),
    );
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    await runner.query('UPDATE counter SET value = 7 WHERE id = 1');
    go.resolve();
    await pause(20);
    await runner.query('UPDATE counter SET value = 8 WHERE id = 1');
    await runner.rollbackTransaction();
    await other;

    expect(read).toEqual([{ value: 0 }]);
  });

  it('lets work the caller schedules after a direct runner.startTransaction() join it (documented limit)', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    await runner.query('UPDATE counter SET value = 7 WHERE id = 1');
    let read: unknown;
    await new Promise<void>((resolve) => setImmediate(resolve)).then(() =>
      source.transaction(async (manager) => (read = await manager.query('SELECT value FROM counter WHERE id = 1'))),
    );
    await runner.rollbackTransaction();

    expect(read).toEqual([{ value: 7 }]);
  });

  it('counts the busy timeout from arrival, across owners', async () => {
    const opened = defer();
    const finishA = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      opened.resolve();
      await finishA.promise;
    });
    await opened.promise;
    const bOwns = defer();
    const b = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 2 }, { value: 2 });
      bOwns.resolve();
      await pause(200);
    });
    const started = Date.now();
    const c = source.query('SELECT value FROM counter WHERE id = 1').catch((error: unknown) => error);
    await pause(180);
    finishA.resolve();
    await bOwns.promise;
    const error = (await c) as { code?: string };
    await Promise.all([a, b]);

    // Neither owner held the connection for the whole 300 ms, but together they did.
    expect(error.code).toBe('SQLITE_BUSY');
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
    expect(await values()).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 2 },
      { id: 3, value: 0 },
    ]);
  });

  it('runs statements queued before a transaction start first, outside that transaction', async () => {
    const opened = defer();
    const finish = defer();
    const a = source.transaction(async (manager) => {
      await manager.update(CounterEntity, { id: 1 }, { value: 1 });
      opened.resolve();
      await finish.promise;
    });
    await opened.promise;
    const order: string[] = [];
    const c = source.query('UPDATE counter SET value = 3 WHERE id = 3').then(() => void order.push('statement'));
    const b = source.transaction(async (manager) => {
      order.push('transaction');
      await manager.update(CounterEntity, { id: 2 }, { value: 2 });
      throw new Error('B fails');
    });
    const bOutcome = expect(b).rejects.toThrow('B fails');
    finish.resolve();
    await Promise.all([a, c, bOutcome]);

    expect(order).toEqual(['statement', 'transaction']);
    expect(await values()).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 0 },
      { id: 3, value: 3 },
    ]);
  });
});

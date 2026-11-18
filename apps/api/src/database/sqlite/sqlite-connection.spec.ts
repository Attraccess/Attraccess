import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, DataSourceOptions, EntitySchema, MigrationInterface, QueryRunner } from 'typeorm';
import { closeResourceTransactionConnection, runSerializedTransaction } from './run-serialized-transaction';
import { createDataSource, SQLITE_BUSY_TIMEOUT_MS } from './sqlite-connection';

type Counter = { id: number; value: number };
const CounterEntity = new EntitySchema<Counter>({
  name: 'Counter',
  tableName: 'counter',
  columns: { id: { type: Number, primary: true }, value: { type: Number } },
});

describe('main SQLite connection', () => {
  let directory: string;
  let source: DataSource;

  const open = (options: Partial<DataSourceOptions> = {}) =>
    createDataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: join(directory, 'test.sqlite'),
      entities: [CounterEntity],
      ...options,
    } as DataSourceOptions).initialize();

  /** Holds the resource-lifecycle connection's write lock, like a plugin `runSerialized` phase mid-way. */
  async function holdSerializedWriteLock() {
    let release!: () => void;
    let entered!: () => void;
    const writerEntered = new Promise<void>((resolve) => (entered = resolve));
    const writerRelease = new Promise<void>((resolve) => (release = resolve));
    const holder = runSerializedTransaction(source.manager, async (manager) => {
      await manager.query('UPDATE counter SET value = value + 1 WHERE id = 1');
      entered();
      await writerRelease;
    });
    await writerEntered;
    return { release, holder };
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'main-sqlite-'));
    source = await open();
    await source.query('CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
    await source.query('INSERT INTO counter VALUES (1, 0), (2, 0)');
  });

  afterEach(async () => {
    await closeResourceTransactionConnection(source);
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('configures the shared busy timeout', async () => {
    expect(source.options).toMatchObject({ timeout: SQLITE_BUSY_TIMEOUT_MS });
    expect(await source.query('PRAGMA busy_timeout')).toEqual([{ timeout: SQLITE_BUSY_TIMEOUT_MS }]);
  });

  it('waits longer than the driver default for the serialized writer before saving', async () => {
    const { release, holder } = await holdSerializedWriteLock();
    const save = source.getRepository(CounterEntity).save({ id: 2, value: 5 });
    // The file lock waits up to the shared busy timeout, which outlasts this lock.
    const timer = setTimeout(release, 1500);
    try {
      await expect(Promise.all([holder, save])).resolves.toEqual([undefined, { id: 2, value: 5 }]);
    } finally {
      clearTimeout(timer);
      release();
      await Promise.allSettled([holder, save]);
    }
    expect(await source.query('SELECT id, value FROM counter ORDER BY id')).toEqual([
      { id: 1, value: 1 },
      { id: 2, value: 5 },
    ]);
  });

  it('waits for the serialized writer instead of failing a read-then-write transaction with SQLITE_BUSY', async () => {
    const { release, holder } = await holdSerializedWriteLock();
    // A deferred transaction holding a read lock cannot wait for the writer: SQLite fails its upgrade at once.
    const write = source.transaction(async (manager) => {
      const { value } = await manager.findOneByOrFail(CounterEntity, { id: 2 });
      await manager.update(CounterEntity, { id: 2 }, { value: value + 10 });
    });
    const timer = setTimeout(release, 100);
    try {
      await expect(Promise.all([holder, write])).resolves.toEqual([undefined, undefined]);
    } finally {
      clearTimeout(timer);
      release();
      await Promise.allSettled([holder, write]);
    }
    expect(await source.query('SELECT value FROM counter WHERE id = 2')).toEqual([{ value: 10 }]);
  });

  it('lets a save and a transaction that start while the serialized writer holds the lock both succeed', async () => {
    const { release, holder } = await holdSerializedWriteLock();
    const save = source.getRepository(CounterEntity).save({ id: 2, value: 5 });
    // Reading first makes a deferred transaction fail at once, however soon the writer releases the lock.
    const write = source.manager.transaction(async (manager) => {
      const { value } = await manager.findOneByOrFail(CounterEntity, { id: 1 });
      await manager.update(CounterEntity, { id: 1 }, { value: value + 10 });
    });
    const timer = setTimeout(release, 100);
    try {
      await expect(Promise.all([holder, save, write])).resolves.toEqual([undefined, { id: 2, value: 5 }, undefined]);
    } finally {
      clearTimeout(timer);
      release();
      await Promise.allSettled([holder, save, write]);
    }
    expect(await source.query('SELECT id, value FROM counter ORDER BY id')).toEqual([
      { id: 1, value: 11 },
      { id: 2, value: 5 },
    ]);
  });

  it('waits for the serialized writer when an autocommit write overlaps another read on the connection', async () => {
    const { release, holder } = await holdSerializedWriteLock();
    const repository = source.getRepository(CounterEntity);
    // Both flows share the connection: the running read's lock must not make the write fail without waiting.
    const read = repository.find({ order: { id: 'ASC' } });
    const update = repository.update({ id: 2 }, { value: 7 });
    const timer = setTimeout(release, 100);
    try {
      await expect(Promise.all([holder, read, update])).resolves.toEqual([
        undefined,
        [
          { id: 1, value: 0 },
          { id: 2, value: 0 },
        ],
        expect.objectContaining({ affected: 1 }),
      ]);
    } finally {
      clearTimeout(timer);
      release();
      await Promise.allSettled([holder, read, update]);
    }
    expect(await source.query('SELECT value FROM counter WHERE id = 2')).toEqual([{ value: 7 }]);
  });

  it('fails with SQLITE_BUSY once a write waited longer than the busy timeout', async () => {
    await source.destroy();
    source = await open({ timeout: 50 });
    const { release, holder } = await holdSerializedWriteLock();
    try {
      await expect(source.getRepository(CounterEntity).save({ id: 2, value: 5 })).rejects.toThrow('SQLITE_BUSY');
    } finally {
      release();
      await holder;
    }
    // The failed BEGIN leaves no transaction state behind: the next save begins and commits its own.
    expect(source.createQueryRunner().isTransactionActive).toBe(false);
    const statements: string[] = [];
    source.subscribers.push({ beforeQuery: ({ query }) => void statements.push(query) });
    await source.getRepository(CounterEntity).save({ id: 2, value: 5 });
    expect(statements).toEqual(expect.arrayContaining(['BEGIN IMMEDIATE TRANSACTION', 'COMMIT']));
    expect(await source.query('SELECT value FROM counter WHERE id = 2')).toEqual([{ value: 5 }]);
  });

  it('begins a transaction another flow starts during the outermost commit after that commit', async () => {
    let second: Promise<void> | undefined;
    source.subscribers.push({
      beforeTransactionCommit: () => {
        // Another request's transaction arrives while the first one commits.
        second ??= source.transaction(async (manager) => {
          await manager.query('UPDATE counter SET value = 20 WHERE id = 2');
          await manager.query('UPDATE counter SET value = value + 1 WHERE id = 2');
        });
      },
    });

    await source.transaction((manager) => manager.query('UPDATE counter SET value = 10 WHERE id = 1'));
    await second;

    const runner = source.createQueryRunner();
    expect([runner.isTransactionActive, (runner as unknown as { transactionDepth: number }).transactionDepth]).toEqual([
      false,
      0,
    ]);
    expect(await source.query('SELECT id, value FROM counter ORDER BY id')).toEqual([
      { id: 1, value: 10 },
      { id: 2, value: 21 },
    ]);
  });

  it('begins outer transactions immediately and keeps savepoints, rollback and subscriber state', async () => {
    const statements: string[] = [];
    const events: string[] = [];
    source.subscribers.push({
      beforeQuery: ({ query }) => {
        statements.push(query);
      },
      afterTransactionCommit: ({ queryRunner }) => {
        events.push(`commit:${queryRunner.isTransactionActive}`);
      },
      afterTransactionRollback: ({ queryRunner }) => {
        events.push(`rollback:${queryRunner.isTransactionActive}`);
      },
    });

    await source.transaction(async (manager) => {
      await manager.query('UPDATE counter SET value = 1 WHERE id = 1');
      await manager.transaction(async (nested) => {
        await nested.query('UPDATE counter SET value = value + 2 WHERE id = 1');
      });
      await expect(
        manager.transaction(async (nested) => {
          await nested.query('UPDATE counter SET value = value + 100 WHERE id = 1');
          throw new Error('Discard only this savepoint');
        }),
      ).rejects.toThrow('Discard only this savepoint');
    });
    await expect(
      source.transaction(async (manager) => {
        await manager.query('UPDATE counter SET value = 50 WHERE id = 1');
        throw new Error('Discard the outer transaction');
      }),
    ).rejects.toThrow('Discard the outer transaction');

    expect(statements.filter((query) => /^(BEGIN|SAVEPOINT|ROLLBACK|COMMIT|RELEASE)/.test(query))).toEqual([
      'BEGIN IMMEDIATE TRANSACTION',
      'SAVEPOINT typeorm_1',
      'RELEASE SAVEPOINT typeorm_1',
      'SAVEPOINT typeorm_1',
      'ROLLBACK TO SAVEPOINT typeorm_1',
      'COMMIT',
      'BEGIN IMMEDIATE TRANSACTION',
      'ROLLBACK',
    ]);
    expect(events).toEqual(['commit:true', 'rollback:true', 'commit:false', 'rollback:false']);
    expect(await source.query('SELECT value FROM counter WHERE id = 1')).toEqual([{ value: 3 }]);
  });

  it('rolls a failed outermost commit back before a transaction waiting for it begins', async () => {
    let second: Promise<void> | undefined;
    source.subscribers.push({
      beforeTransactionCommit: () => {
        if (second) return;
        second = source.transaction((manager) => manager.query('UPDATE counter SET value = 20 WHERE id = 2'));
        // Stands in for a COMMIT that fails, e.g. with SQLITE_BUSY while another connection still reads.
        throw new Error('Commit refused');
      },
    });

    await expect(
      source.transaction((manager) => manager.query('UPDATE counter SET value = 10 WHERE id = 1')),
    ).rejects.toThrow('Commit refused');
    await second;

    const runner = source.createQueryRunner();
    expect([runner.isTransactionActive, (runner as unknown as { transactionDepth: number }).transactionDepth]).toEqual([
      false,
      0,
    ]);
    expect(await source.query('SELECT id, value FROM counter ORDER BY id')).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 20 },
    ]);
    // No transaction is left open on the main connection: the serialized writer gets the lock.
    await runSerializedTransaction(source.manager, (manager) =>
      manager.query('UPDATE counter SET value = 1 WHERE id = 1'),
    );
  });

  it.each(['all', 'each'] as const)('runs migrations in %s-transaction mode', async (transaction) => {
    const statements: string[] = [];
    class CreateA1700000000001 implements MigrationInterface {
      async up(runner: QueryRunner) {
        await runner.query('CREATE TABLE a (id INTEGER PRIMARY KEY)');
      }
      async down(runner: QueryRunner) {
        await runner.query('DROP TABLE a');
      }
    }
    class CreateB1700000000002 implements MigrationInterface {
      async up(runner: QueryRunner) {
        await runner.query('CREATE TABLE b (id INTEGER PRIMARY KEY)');
      }
      async down(runner: QueryRunner) {
        await runner.query('DROP TABLE b');
      }
    }
    await source.destroy();
    source = await open({ migrations: [CreateA1700000000001, CreateB1700000000002] });
    source.subscribers.push({ beforeQuery: ({ query }) => void statements.push(query) });

    await source.runMigrations({ transaction });

    expect(statements.filter((query) => query.startsWith('BEGIN'))).toEqual(
      transaction === 'all'
        ? ['BEGIN IMMEDIATE TRANSACTION']
        : ['BEGIN IMMEDIATE TRANSACTION', 'BEGIN IMMEDIATE TRANSACTION'],
    );
    expect(
      await source.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('a', 'b') ORDER BY name`),
    ).toEqual([{ name: 'a' }, { name: 'b' }]);
  });
});

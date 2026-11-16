import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { closeResourceTransactionConnection, runSerializedTransaction } from './run-serialized-transaction';

describe('SQLite resource write transactions', () => {
  let directory: string;
  let source: DataSource;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'resource-write-'));
    source = await new DataSource({ type: 'sqlite', database: join(directory, 'test.sqlite') }).initialize();
    await source.query('CREATE TABLE counter (value INTEGER NOT NULL)');
    await source.query('INSERT INTO counter VALUES (0)');
  });

  afterEach(async () => {
    await closeResourceTransactionConnection(source);
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('waits for another connection writer before reading instead of failing a read-to-write upgrade', async () => {
    // Initialize the dedicated connection before the main writer obtains its lock.
    await runSerializedTransaction(source.manager, async () => undefined);
    let release!: () => void;
    let entered!: () => void;
    const writerEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const writerRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mainWrite = source.transaction(async (manager) => {
      await manager.query('UPDATE counter SET value = 1');
      entered();
      await writerRelease;
    });
    await writerEntered;
    const resourceWrite = runSerializedTransaction(source.manager, async (manager) => {
      const [{ value }] = await manager.query('SELECT value FROM counter');
      await manager.query('UPDATE counter SET value = ?', [value + 1]);
    });
    const outcomes = Promise.allSettled([mainWrite, resourceWrite]);
    const timer = setTimeout(release, 50);
    try {
      expect(await outcomes).toEqual([
        { status: 'fulfilled', value: undefined },
        { status: 'fulfilled', value: undefined },
      ]);
      expect(await source.query('SELECT value FROM counter')).toEqual([{ value: 2 }]);
    } finally {
      clearTimeout(timer);
      release();
      await outcomes;
    }
  });
  it('preserves nested savepoints and transaction subscriber state', async () => {
    const events: string[] = [];
    const statements: string[] = [];
    const committedValues: unknown[] = [];
    source.subscribers.push({
      beforeQuery: ({ query }) => {
        statements.push(query);
      },
      afterTransactionStart: ({ queryRunner }) => {
        events.push(`start:${queryRunner.isTransactionActive}`);
      },
      afterTransactionCommit: async ({ queryRunner }) => {
        events.push(`commit:${queryRunner.isTransactionActive}`);
        // This is the same outer-commit distinction used by audit subscribers.
        if (!queryRunner.isTransactionActive) {
          committedValues.push(await source.query('SELECT value FROM counter'));
        }
      },
      afterTransactionRollback: ({ queryRunner }) => {
        events.push(`rollback:${queryRunner.isTransactionActive}`);
      },
    });

    await runSerializedTransaction(source.manager, async (manager) => {
      await manager.query('UPDATE counter SET value = 1');
      await manager.transaction(async (nested) => {
        await nested.query('UPDATE counter SET value = value + 2');
      });
      await expect(
        manager.transaction(async (nested) => {
          await nested.query('UPDATE counter SET value = value + 100');
          throw new Error('Discard only this savepoint');
        }),
      ).rejects.toThrow('Discard only this savepoint');
      expect(manager.queryRunner?.isTransactionActive).toBe(true);
      expect(await manager.query('SELECT value FROM counter')).toEqual([{ value: 3 }]);
    });

    expect(events).toEqual(['start:true', 'start:true', 'commit:true', 'start:true', 'rollback:true', 'commit:false']);
    expect(statements.filter((query) => query.startsWith('BEGIN'))).toEqual(['BEGIN IMMEDIATE TRANSACTION']);
    expect(statements.filter((query) => query.startsWith('SAVEPOINT'))).toEqual([
      'SAVEPOINT typeorm_1',
      'SAVEPOINT typeorm_1',
    ]);
    expect(statements).toContain('ROLLBACK TO SAVEPOINT typeorm_1');
    expect(committedValues).toEqual([[{ value: 3 }]]);
  });

  it('rolls back the outer transaction and lets the next queued write commit', async () => {
    const events: string[] = [];
    source.subscribers.push({
      afterTransactionCommit: ({ queryRunner }) => {
        events.push(`commit:${queryRunner.isTransactionActive}`);
      },
      afterTransactionRollback: ({ queryRunner }) => {
        events.push(`rollback:${queryRunner.isTransactionActive}`);
      },
    });

    const failed = runSerializedTransaction(source.manager, async (manager) => {
      await manager.transaction(async (nested) => {
        await nested.query('UPDATE counter SET value = 100');
      });
      throw new Error('Discard the outer transaction');
    });
    const rejection = expect(failed).rejects.toThrow('Discard the outer transaction');
    const recovered = runSerializedTransaction(source.manager, async (manager) => {
      expect(await manager.query('SELECT value FROM counter')).toEqual([{ value: 0 }]);
      await manager.query('UPDATE counter SET value = 2');
    });
    await Promise.all([rejection, recovered]);

    expect(events).toEqual(['commit:true', 'rollback:false', 'commit:false']);
    expect(await source.query('SELECT value FROM counter')).toEqual([{ value: 2 }]);
  });
  it('recovers after BEGIN IMMEDIATE times out behind another writer', async () => {
    // The dedicated connection inherits this timeout when first initialized.
    source.setOptions({ busyTimeout: 30 });
    await runSerializedTransaction(source.manager, async () => undefined);
    let release!: () => void;
    let entered!: () => void;
    const writerEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const writerRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mainWrite = source.transaction(async (manager) => {
      await manager.query('UPDATE counter SET value = 1');
      entered();
      await writerRelease;
    });
    await writerEntered;
    const work = jest.fn(async () => undefined);
    try {
      // TypeORM attempts a rollback after the rejected BEGIN even though SQLite
      // never entered a transaction. That must not poison the next queued phase.
      await expect(runSerializedTransaction(source.manager, work)).rejects.toThrow('SQLITE_BUSY');
      expect(work).not.toHaveBeenCalled();
    } finally {
      release();
      await mainWrite;
    }

    await runSerializedTransaction(source.manager, async (manager) => {
      const [{ value }] = await manager.query('SELECT value FROM counter');
      await manager.query('UPDATE counter SET value = ?', [value + 1]);
    });
    expect(await source.query('SELECT value FROM counter')).toEqual([{ value: 2 }]);
  });
});

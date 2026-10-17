import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import {
  ConflictScope,
  DatabaseTransactions,
  operationToken,
  TransactionDriver,
  TransactionScope,
} from './transaction-scope';
import { closeResourceTransactionConnection, SqliteTransactionDriver } from './sqlite/transactions';

const conflict: ConflictScope = { resourceIds: [1], accountIds: [2] };
const counter = operationToken<{ increment(): Promise<void>; count(): Promise<number> }>('test counter', [
  'increment',
  'count',
]);

function deferred() {
  let resolve: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
}

describe('neutral transactions', () => {
  it('allows a capable driver to overlap independent scopes without a service mutex', async () => {
    const firstEntered = deferred();
    const secondEntered = deferred();
    const driver: TransactionDriver = {
      backend: 'capable-test-driver',
      run: async (_conflicts, work) =>
        work({
          resolve: () => {
            throw new Error('unused');
          },
        }),
    };
    const service = new DatabaseTransactions(driver);
    await Promise.all([
      service.run(conflict, async () => {
        firstEntered.resolve();
        await secondEntered.promise;
      }),
      service.run({ resourceIds: [3], accountIds: [] }, async () => {
        await firstEntered.promise;
        secondEntered.resolve();
      }),
    ]);
  });

  it('never replays a failed database phase', async () => {
    const work = jest.fn().mockRejectedValue(new Error('busy'));
    const driver: TransactionDriver = {
      backend: 'test',
      run: async (_conflicts, callback) =>
        callback({
          resolve: () => {
            throw new Error('unused');
          },
        }),
    };
    await expect(new DatabaseTransactions(driver).run(conflict, work)).rejects.toThrow('busy');
    expect(work).toHaveBeenCalledTimes(1);
  });
});

describe('SQLite transaction scope', () => {
  let directory: string;
  let source: DataSource;
  let driver: SqliteTransactionDriver;
  let service: DatabaseTransactions;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'att1146-transactions-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'database.sqlite'),
      entities: [],
      synchronize: false,
    }).initialize();
    await source.query('CREATE TABLE counter (value integer NOT NULL)');
    await source.query('INSERT INTO counter VALUES (0)');
    driver = new SqliteTransactionDriver(source);
    driver.register(counter, (manager) => ({
      increment: async () => {
        await manager.query('UPDATE counter SET value = value + 1');
      },
      count: async () => (await manager.query('SELECT value FROM counter'))[0].value,
    }));
    service = new DatabaseTransactions(driver);
  });

  afterEach(async () => {
    await closeResourceTransactionConnection(source);
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('releases a failed connection initialization without replaying the phase', async () => {
    const initialize = jest
      .spyOn(DataSource.prototype, 'initialize')
      .mockRejectedValueOnce(new Error('initialization failed'));
    const phase = jest.fn(async (scope: TransactionScope) => scope.resolve(counter).increment());
    try {
      await expect(service.run(conflict, phase)).rejects.toThrow('initialization failed');
      expect(phase).not.toHaveBeenCalled();
    } finally {
      initialize.mockRestore();
    }
    await service.run(conflict, phase);
    expect(phase).toHaveBeenCalledTimes(1);
  });

  it('does not expose adapter fields or prototypes through the operation interface', async () => {
    const token = operationToken<{ read(): number }>('private adapter', ['read']);
    driver.register(token, () => ({ read: () => 1, manager: source.manager }));
    await service.run(conflict, async (scope) => {
      const operations = scope.resolve(token);
      expect(operations.read()).toBe(1);
      expect(operations).not.toHaveProperty('manager');
      expect(Object.keys(operations)).toEqual([]);
      expect(Object.getPrototypeOf(operations)).toBe(Object.prototype);
    });
  });

  it('binds operations to one transaction, reuses an explicit parent and notifies only after outer commit', async () => {
    const events: string[] = [];
    await service.run(conflict, async (scope) => {
      await scope.resolve(counter).increment();
      scope.afterCommit(async () => {
        expect((await source.query('SELECT value FROM counter'))[0].value).toBe(2);
        events.push('first');
      });
      await service.run(
        conflict,
        async (child) => {
          expect(child).toBe(scope);
          expect(await child.resolve(counter).count()).toBe(1);
          await child.resolve(counter).increment();
          child.afterCommit(() => {
            events.push('second');
          });
        },
        scope,
      );
      expect(events).toEqual([]);
    });
    expect(events).toEqual(['first', 'second']);
  });

  it('rolls back all participating writes and suppresses notifications on failure', async () => {
    const notify = jest.fn();
    await expect(
      service.run(conflict, async (scope) => {
        await scope.resolve(counter).increment();
        scope.afterCommit(notify);
        throw new Error('reject phase');
      }),
    ).rejects.toThrow('reject phase');
    expect((await source.query('SELECT value FROM counter'))[0].value).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects captured operations and callbacks after the scope closes', async () => {
    let captured: TransactionScope;
    let increment: () => Promise<void>;
    await service.run(conflict, async (scope) => {
      captured = scope;
      increment = scope.resolve(counter).increment;
    });
    expect(() => increment()).toThrow('closed');
    expect(() => captured.resolve(counter)).toThrow('closed');
    expect(() => captured.afterCommit(() => undefined)).toThrow('closed');
    await expect(service.run(conflict, async () => undefined, captured)).rejects.toThrow('Invalid parent');
  });

  it('rejects a foreign backend/connection parent and conflict expansion', async () => {
    const other = new DatabaseTransactions(new SqliteTransactionDriver(source));
    await service.run(conflict, async (scope) => {
      await expect(other.run(conflict, async () => undefined, scope)).rejects.toThrow('Invalid parent');
      await expect(service.run({ resourceIds: [9], accountIds: [] }, async () => undefined, scope)).rejects.toThrow(
        'expand',
      );
    });
  });

  it('keeps committed rows and ordered delivery when a notification fails', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const delivered = jest.fn();
    try {
      await service.run(conflict, async (scope) => {
        await scope.resolve(counter).increment();
        scope.afterCommit(() => {
          throw new Error('delivery failed');
        });
        scope.afterCommit(delivered);
      });
      expect((await source.query('SELECT value FROM counter'))[0].value).toBe(1);
      expect(delivered).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});

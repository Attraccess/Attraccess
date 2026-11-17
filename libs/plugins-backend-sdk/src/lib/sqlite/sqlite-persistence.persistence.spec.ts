import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  PLUGIN_ENGINE_ACCESS,
  PluginPersistenceBackendError,
  PluginPersistenceContext,
  PluginTransactionScope,
} from '../plugin-persistence';
import { Column, Entity, PrimaryGeneratedColumn } from './typeorm-surface';
import { createHostTransactionScope, createSqlitePluginPersistence, sqlitePersistence } from './sqlite-persistence';

@Entity({ name: 'sdk_widget' })
class Widget {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  label!: string;
}

class NotRegistered {}

describe('SQLite plugin persistence on a real database', () => {
  let source: DataSource;
  let callbackErrors: unknown[];
  let persistence: PluginPersistenceContext;

  const labels = async () => (await source.getRepository(Widget).find({ order: { id: 'ASC' } })).map((w) => w.label);

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [Widget],
    }).initialize();
    callbackErrors = [];
    persistence = createSqlitePluginPersistence({
      pluginName: 'widgets',
      connection: () => source,
      entities: [Widget],
      onCallbackError: (error) => callbackErrors.push(error),
    });
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('names the engine and supports only it', () => {
    expect(persistence.backend).toBe('sqlite');
    expect(persistence.supports('sqlite')).toBe(true);
  });

  it('commits every write of the callback together and hands the SQLite manager to the engine subpath', async () => {
    const sqlite = sqlitePersistence({ persistence });
    await sqlite.transaction(async (manager) => {
      await manager.getRepository(Widget).save({ label: 'a' });
      await manager.getRepository(Widget).save({ label: 'b' });
    });
    expect(await labels()).toEqual(['a', 'b']);
  });

  it('rolls back every write when the callback throws, and runs no post-commit callback', async () => {
    const after = jest.fn();
    const sqlite = sqlitePersistence({ persistence });
    await expect(
      sqlite.transaction(async (manager, scope) => {
        scope.afterCommit(after);
        await manager.getRepository(Widget).save({ label: 'lost' });
        throw new Error('overlap detected');
      }),
    ).rejects.toThrow('overlap detected');
    expect(await labels()).toEqual([]);
    expect(after).not.toHaveBeenCalled();
  });

  it('runs post-commit callbacks in order after the commit and survives a failing callback', async () => {
    const seen: string[] = [];
    const sqlite = sqlitePersistence({ persistence });
    await sqlite.transaction(async (manager, scope) => {
      await manager.getRepository(Widget).save({ label: 'x' });
      scope.afterCommit(async () => void seen.push(`first:${(await labels()).join(',')}`));
      scope.afterCommit(() => {
        throw new Error('mqtt down');
      });
      scope.afterCommit(() => void seen.push('third'));
    });
    expect(seen).toEqual(['first:x', 'third']);
    expect(callbackErrors).toHaveLength(1);
    expect(await labels()).toEqual(['x']);
  });

  it('closes the scope once the transaction ended', async () => {
    let kept: PluginTransactionScope | undefined;
    await persistence.transaction(async (scope) => {
      kept = scope;
      expect(scope.isOpen).toBe(true);
    });
    expect(kept?.isOpen).toBe(false);
    expect(() => kept?.afterCommit(() => undefined)).toThrow(/closed/);
    expect(() => sqlitePersistence({ persistence }).managerOf(kept as PluginTransactionScope)).toThrow(/closed/);
  });

  it('rejects a nested transaction instead of deadlocking, also when it is only scheduled', async () => {
    let scheduled: Promise<unknown> | undefined;
    await persistence.transaction(async () => {
      await expect(persistence.transaction(async () => 1)).rejects.toThrow(/inside a transaction callback/);
      scheduled = persistence.transaction(async () => 2).catch((error) => error);
      await scheduled;
    });
    expect(await scheduled).toBeInstanceOf(Error);
    // Once the callback settled, new transactions are fine again.
    await expect(persistence.transaction(async () => 3)).resolves.toBe(3);
  });

  it('serves repositories of registered entities only, never host tables', () => {
    const sqlite = sqlitePersistence({ persistence });
    expect(sqlite.getRepository(Widget).metadata.tableName).toBe('sdk_widget');
    expect(() => sqlite.getRepository(NotRegistered)).toThrow(/registered/);
    expect(() => sqlite.getRepository('User')).toThrow(/registered/);
  });

  it('resolves a repository retained before the host connection was ready on first use', async () => {
    let ready = false;
    const lazy = createSqlitePluginPersistence({
      pluginName: 'widgets',
      connection: () => {
        if (!ready) throw new Error('Host DataSource is not available yet');
        return source;
      },
      entities: [Widget],
    });
    const retained = sqlitePersistence({ persistence: lazy }).getRepository(Widget);
    expect(() => retained.find()).toThrow(/not available yet/);
    ready = true;
    await retained.save({ label: 'late' });
    expect(await labels()).toEqual(['late']);
  });

  it('fails clearly when the host runs another engine', () => {
    const other = {
      backend: 'postgres',
      supports: () => false,
      transaction: jest.fn(),
      [PLUGIN_ENGINE_ACCESS]: { backend: 'postgres', connection: jest.fn(), handleOf: jest.fn() },
    } as unknown as PluginPersistenceContext;
    expect(() => sqlitePersistence({ persistence: other })).toThrow(PluginPersistenceBackendError);
    expect(() => sqlitePersistence({ persistence: other })).toThrow(/needs the sqlite database engine.*runs postgres/);
  });

  it('refuses a scope that does not belong to the SQLite engine', () => {
    const foreign = { isOpen: true, afterCommit: () => undefined } as PluginTransactionScope;
    expect(() => sqlitePersistence({ persistence }).managerOf(foreign)).toThrow(PluginPersistenceBackendError);
  });

  it('exposes a host-owned transaction to the engine subpath, but never lets a plugin defer work onto it', async () => {
    await source.transaction(async (manager) => {
      const scope = createHostTransactionScope(manager);
      expect(sqlitePersistence({ persistence }).managerOf(scope)).toBe(manager);
      expect(() => scope.afterCommit(() => undefined)).toThrow(/owned by the host/);
    });
  });

  it('runs on the supplied write path, so the host can serialize plugin transactions with its own', async () => {
    let calls = 0;
    const runInTransaction = <T>(work: (manager: DataSource['manager']) => Promise<T>): Promise<T> => {
      calls++;
      return source.transaction((manager) => work(manager));
    };
    const routed = createSqlitePluginPersistence({
      pluginName: 'widgets',
      connection: () => source,
      entities: [Widget],
      runInTransaction,
    });
    await routed.transaction(async () => undefined);
    expect(calls).toBe(1);
  });
});

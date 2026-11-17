import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Column, Entity, PrimaryGeneratedColumn, sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';
import { DataSource } from 'typeorm';
import { dataSourceConfig } from '../../datasource';
import { closeResourceTransactionConnection, runSerializedTransaction } from '../../sqlite/run-serialized-transaction';
import { createPluginPersistenceHost } from './plugin-persistence-host';

@Entity({ name: 'host_spec_booking' })
class Booking {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  slot!: string;
}

describe('plugin persistence host on a real SQLite file', () => {
  let directory: string;
  let source: DataSource;
  let independent: DataSource;
  const host = createPluginPersistenceHost(() => source);
  const entityRegistry = dataSourceConfig.entities as unknown[];
  const registryBefore = [...entityRegistry];

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'plugin-persistence-'));
    const file = join(directory, 'host.sqlite');
    source = await new DataSource({
      type: 'sqlite',
      database: file,
      entities: [Booking],
      synchronize: true,
    }).initialize();
    // A second, independent connection to the same file: what a plugin commit must be visible to.
    independent = await new DataSource({ type: 'sqlite', database: file, entities: [Booking] }).initialize();
  });

  afterEach(async () => {
    entityRegistry.splice(0, entityRegistry.length, ...registryBefore);
    await closeResourceTransactionConnection(source);
    await independent.destroy();
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  const context = () => ({ persistence: host.createContext('bookings', [Booking]) });
  const slots = async (reader: DataSource = independent) =>
    (await reader.getRepository(Booking).find({ order: { id: 'ASC' } })).map((booking) => booking.slot);

  it('names the sqlite backend', () => {
    expect(host.backend).toBe('sqlite');
  });

  it('registers plugin entities into the host connection schema once', () => {
    expect(host.registerEntities([Booking, Booking])).toBe(1);
    expect(host.registerEntities([Booking])).toBe(0);
    expect(entityRegistry).toContain(Booking);
  });

  it('commits a plugin transaction so that an independent connection sees it, and runs after-commit work then', async () => {
    const { persistence } = context();
    const seen: string[][] = [];
    await sqlitePersistence({ persistence }).transaction(async (manager, scope) => {
      await manager.getRepository(Booking).save({ slot: 'mon' });
      // Uncommitted work is invisible to other connections.
      seen.push(await slots());
      scope.afterCommit(async () => void seen.push(await slots()));
    });
    expect(seen).toEqual([[], ['mon']]);
  });

  it('rolls back everything when the callback fails and never runs after-commit work', async () => {
    const { persistence } = context();
    const after = jest.fn();
    await expect(
      sqlitePersistence({ persistence }).transaction(async (manager, scope) => {
        scope.afterCommit(after);
        await manager.getRepository(Booking).save({ slot: 'lost' });
        throw new Error('overlap');
      }),
    ).rejects.toThrow('overlap');
    expect(await slots()).toEqual([]);
    expect(after).not.toHaveBeenCalled();
    // The failure leaves the queue usable.
    await persistence.transaction(async () => undefined);
  });

  it('makes check-then-write sequences race-free across concurrent plugin callers', async () => {
    const { persistence } = context();
    const sqlite = sqlitePersistence({ persistence });
    const book = (slot: string) =>
      sqlite.transaction(async (manager) => {
        const taken = await manager.getRepository(Booking).countBy({ slot });
        if (taken > 0) return false;
        // Yield between check and write: without serialization another caller would pass the same check.
        await new Promise((resolve) => setTimeout(resolve, 5));
        await manager.getRepository(Booking).save({ slot });
        return true;
      });
    const results = await Promise.all(Array.from({ length: 8 }, () => book('tue')));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await slots()).toEqual(['tue']);
  });

  it('shares one write queue with the host: plugin and core transactions never overlap', async () => {
    const { persistence } = context();
    const order: string[] = [];
    const core = runSerializedTransaction(source.manager, async (manager) => {
      order.push('core:start');
      await manager.getRepository(Booking).save({ slot: 'core' });
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('core:end');
    });
    const plugin = persistence.transaction(async () => {
      order.push('plugin:start');
    });
    await Promise.all([core, plugin]);
    expect(order).toEqual(['core:start', 'core:end', 'plugin:start']);
  });

  /**
   * A nested `persistence.transaction` call inside a plugin transaction would wait for the write queue its own outer
   * unit holds. The documented outcome: the nested call is rejected at once and never writes. If the plugin lets that
   * rejection propagate, the outer unit rolls back its write too; if the plugin catches it, the outer unit is not
   * affected and commits its own write.
   */
  describe('a nested persistence.transaction call on the host file', () => {
    const NESTED = /inside a transaction callback/;

    /** Fails the test instead of hanging when `promise` does not settle in time (a deadlock on the queue). */
    async function withoutDeadlock<T>(promise: Promise<T>): Promise<T> {
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('deadlocked on the shared write queue')), 5_000);
      });
      try {
        return await Promise.race([promise, deadline]);
      } finally {
        clearTimeout(timer);
      }
    }

    it('is rejected without a deadlock, and the outer write rolls back when the rejection propagates', async () => {
      const { persistence } = context();
      const sqlite = sqlitePersistence({ persistence });
      const outer = sqlite.transaction(async (manager) => {
        await manager.getRepository(Booking).save({ slot: 'outer' });
        await sqlite.transaction(async (inner) => {
          await inner.getRepository(Booking).save({ slot: 'inner' });
        });
      });

      await expect(withoutDeadlock(outer)).rejects.toThrow(NESTED);
      expect(await slots()).toEqual([]);
      // The queue is free for the next caller.
      await withoutDeadlock(persistence.transaction(async () => undefined));
    });

    it('is rejected without a deadlock, and the outer write commits when the plugin catches the rejection', async () => {
      const { persistence } = context();
      const sqlite = sqlitePersistence({ persistence });
      let nested: unknown;
      await withoutDeadlock(
        sqlite.transaction(async (manager) => {
          await manager.getRepository(Booking).save({ slot: 'outer' });
          nested = await sqlite
            .transaction(async (inner) => inner.getRepository(Booking).save({ slot: 'inner' }))
            .catch((error: unknown) => error);
        }),
      );

      expect((nested as Error).message).toMatch(NESTED);
      expect(await slots()).toEqual(['outer']);
    });
  });

  it('only serves repositories of the entities the plugin registered', async () => {
    const sqlite = sqlitePersistence(context());
    await sqlite.getRepository(Booking).save({ slot: 'wed' });
    expect(await slots()).toEqual(['wed']);
    class Other {}
    expect(() => sqlite.getRepository(Other)).toThrow(/registered/);
  });
});

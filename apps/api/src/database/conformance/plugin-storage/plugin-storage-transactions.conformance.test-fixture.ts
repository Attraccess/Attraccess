import { PluginStorageInvalid } from '@attraccess/plugins-backend-sdk';
import { createHarness, type Harness } from './storage-harness.test-fixture';
import type { StorageBackendFixture } from './storage-fixture';

/** Fails the test instead of hanging when `promise` does not settle in time (a deadlock on the write queue). */
async function withoutDeadlock<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('deadlocked on the shared write queue')), 10_000);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Conformance of the transaction capability on real database connections, where the host's own unit of work, its
 * host data ports and other processes take part. The backend-neutral transaction rules are the SDK's contract suite
 * (see plugin-storage-contract.conformance.test-fixture.ts).
 */
export function describePluginStorageTransactions(fixture: StorageBackendFixture): void {
  describe(`plugin storage transactions (${fixture.name})`, () => {
    let harness: Harness;
    beforeAll(async () => {
      harness = await createHarness(fixture);
    });
    afterAll(() => harness.db.close());

    /** The committed names, as another process reads them (never the uncommitted writes of a running transaction). */
    const committed = async (prefix: string) =>
      (
        await harness.db.committed(
          `SELECT name FROM plugin_conformance_plugin_items WHERE name LIKE '${prefix}%' ORDER BY name`,
        )
      ).map((row) => String(row.name));

    it('commits so that an independent connection sees it, and runs after-commit work then', async () => {
      const writer = await harness.open();
      const seen: string[][] = [];
      await writer.persistence.transaction(async (scope) => {
        await writer.items.insert({ name: 'tx-commit' }, { scope });
        // Uncommitted work is invisible to other connections, visible inside the scope.
        seen.push(await committed('tx-commit'));
        expect(await writer.items.count({ name: 'tx-commit' }, { scope })).toBe(1);
        scope.afterCommit(async () => void seen.push(await committed('tx-commit')));
      });
      expect(seen).toEqual([[], ['tx-commit']]);
    });

    // SQLite only: PostgreSQL transactions of the plugin and the host run concurrently.
    (fixture.flavor === 'sqlite' ? it : it.skip)(
      'shares one write queue with the host: plugin and core transactions never overlap',
      async () => {
        const side = await harness.open();
        const order: string[] = [];
        const core = side.connection.unitOfWork.run(async (scope) => {
          order.push('core:start');
          await side.connection.insertResource(scope, 'queue-core');
          await new Promise((resolve) => setTimeout(resolve, 30));
          order.push('core:end');
        });
        const plugin = side.persistence.transaction(async () => void order.push('plugin:start'));
        await Promise.all([core, plugin]);
        expect(order).toEqual(['core:start', 'core:end', 'plugin:start']);
      },
    );

    describe('shared scope with core writes', () => {
      it('joins host ports in the plugin transaction: an uncommitted core row is read inside, never outside', async () => {
        const side = await harness.open();
        const resourceId = await harness.db.seedResource('hostdata-committed');
        const seenInside = await side.persistence.transaction(async (scope) => {
          await side.items.insert({ name: 'hd-row' }, { scope });
          return side.connection.hostData.resources.get(resourceId, scope);
        });
        expect(seenInside).toMatchObject({ id: resourceId, name: 'hostdata-committed' });
        expect(await committed('hd-row')).toEqual(['hd-row']);
      });

      it("lets a hook read through the host's scope, and refuses writes through it", async () => {
        const side = await harness.open();
        await side.items.insert({ name: 'uow-seeded' });
        await side.connection.unitOfWork.run(async (core) => {
          const hostScope = side.connection.hostScope(core);
          const resourceId = await side.connection.insertResource(core, 'uow-resource');
          // The plugin reads its own rows and what the same unit wrote.
          expect(await side.items.count({ name: 'uow-seeded' }, { scope: hostScope })).toBe(1);
          expect(await side.connection.hostData.resources.get(resourceId, hostScope)).toMatchObject({
            name: 'uow-resource',
          });
          await expect(side.items.insert({ name: 'uow-write' }, { scope: hostScope })).rejects.toThrow(/read-only/);
          await expect(side.items.update({ name: 'uow-seeded' }, { qty: 1 }, { scope: hostScope })).rejects.toThrow(
            PluginStorageInvalid,
          );
          expect(() => hostScope.afterCommit(() => undefined)).toThrow(/owned by the host/);
        });
        expect(await committed('uow-')).toEqual(['uow-seeded']);
      });

      // SQLite: the host's transaction holds the single writer, so a plugin write or transaction started inside it would
      // wait for it. PostgreSQL has no such queue: those calls are transactions of their own, independent of the host's.
      (fixture.flavor === 'sqlite' ? it : it.skip)(
        "refuses at once a plugin write without scope or a plugin transaction inside the host's own transaction",
        async () => {
          const side = await harness.open();
          const started = Date.now();
          await withoutDeadlock(
            side.connection.unitOfWork.run(async (core) => {
              await side.connection.insertResource(core, 'uow-hook-resource');
              // What a hook called inside the host's unit of work would do: both would wait for that unit itself.
              await expect(side.items.insert({ name: 'uow-hook-write' })).rejects.toThrow(/host's own transaction/);
              await expect(side.persistence.transaction(async () => undefined)).rejects.toBeInstanceOf(
                PluginStorageInvalid,
              );
              // Reads stay possible, with and without the scope.
              expect(await side.items.count({ name: 'uow-hook-write' })).toBe(0);
              expect(await side.items.count({}, { scope: side.connection.hostScope(core) })).toBeGreaterThanOrEqual(0);
            }),
          );
          expect(Date.now() - started).toBeLessThan(5_000);
          expect(await committed('uow-hook-')).toEqual([]);
          // Outside the unit the same calls work again.
          await side.items.insert({ name: 'uow-hook-after' });
          await side.persistence.transaction(async (scope) => void (await side.items.count({}, { scope })));
          expect(await committed('uow-hook-')).toEqual(['uow-hook-after']);
        },
      );

      (fixture.flavor === 'postgres' ? it : it.skip)(
        "runs a plugin write without scope inside the host's transaction as a transaction of its own",
        async () => {
          const side = await harness.open();
          await withoutDeadlock(
            side.connection.unitOfWork.run(async (core) => {
              await side.connection.insertResource(core, 'uow-own-resource');
              await side.items.insert({ name: 'uow-own-write' });
              // Committed at once, whatever becomes of the host's transaction.
              expect(await committed('uow-own-')).toEqual(['uow-own-write']);
              // A plugin transaction is independent of it too.
              await side.persistence.transaction(async (scope) => void (await side.items.count({}, { scope })));
              throw new Error('host rolls back');
            }),
          ).catch((error: Error) => expect(error.message).toBe('host rolls back'));
          expect(await committed('uow-own-')).toEqual(['uow-own-write']);
        },
      );

      it('closes the host scope with the unit of work', async () => {
        const side = await harness.open();
        let kept!: ReturnType<typeof side.connection.hostScope>;
        await side.connection.unitOfWork.run(async (core) => void (kept = side.connection.hostScope(core)));
        expect(kept.isOpen).toBe(false);
        await expect(side.items.count({}, { scope: kept })).rejects.toThrow(/closed/);
      });
    });
  });
}

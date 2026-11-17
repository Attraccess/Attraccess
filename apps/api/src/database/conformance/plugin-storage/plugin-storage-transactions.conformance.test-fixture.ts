import { PluginStorageInvalid, PluginStorageUniqueViolation } from '@attraccess/plugins-backend-sdk';
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
 * Conformance of the transaction capability: `context.persistence.transaction` with the record port, host ports and
 * the host's own unit of work, on real database connections.
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
      (await harness.db.committed(`SELECT name FROM plugin_conformance_plugin_items WHERE name LIKE '${prefix}%' ORDER BY name`)).map(
        (row) => String(row.name),
      );

    const names = async (side: { items: { find(q: object): Promise<Array<{ name: string }>> } }, prefix: string) =>
      (await side.items.find({ where: { name: { startsWith: prefix } }, orderBy: [{ field: 'name' }] })).map((row) => row.name);

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

    it('rolls back everything when the callback fails and never runs after-commit work', async () => {
      const side = await harness.open();
      const after = jest.fn();
      await expect(
        side.persistence.transaction(async (scope) => {
          scope.afterCommit(after);
          await side.items.insert({ name: 'tx-lost' }, { scope });
          throw new Error('overlap');
        }),
      ).rejects.toThrow('overlap');
      expect(await names(side, 'tx-lost')).toEqual([]);
      expect(after).not.toHaveBeenCalled();
      await withoutDeadlock(side.persistence.transaction(async () => undefined));
    });

    it('keeps a failing after-commit callback from undoing the commit or stopping the next one', async () => {
      const side = await harness.open();
      const later = jest.fn();
      await side.persistence.transaction(async (scope) => {
        await side.items.insert({ name: 'tx-callbacks' }, { scope });
        scope.afterCommit(() => {
          throw new Error('mqtt down');
        });
        scope.afterCommit(later);
      });
      expect(await names(side, 'tx-callbacks')).toEqual(['tx-callbacks']);
      expect(later).toHaveBeenCalledTimes(1);
    });

    it('does not poison the scope when a write violates a unique key: the transaction goes on', async () => {
      const side = await harness.open();
      await side.items.insert({ name: 'tx-unique' });
      await side.persistence.transaction(async (scope) => {
        await side.items.insert({ name: 'tx-unique-b' }, { scope });
        await expect(side.items.insert({ name: 'tx-unique' }, { scope })).rejects.toBeInstanceOf(PluginStorageUniqueViolation);
        await side.items.insert({ name: 'tx-unique-c' }, { scope });
      });
      expect(await names(side, 'tx-unique')).toEqual(['tx-unique', 'tx-unique-b', 'tx-unique-c']);
    });

    it('closes the scope: a call with it after the transaction is refused', async () => {
      const side = await harness.open();
      let kept!: Parameters<Parameters<typeof side.persistence.transaction>[0]>[0];
      await side.persistence.transaction(async (scope) => void (kept = scope));
      expect(kept.isOpen).toBe(false);
      await expect(side.items.count({}, { scope: kept })).rejects.toThrow(/closed/);
      expect(() => kept.afterCommit(() => undefined)).toThrow(/closed/);
      await expect(side.items.count({}, { scope: {} })).rejects.toThrow(/not created by the host/);
    });

    it('makes check-then-write sequences race-free across concurrent callers on one connection', async () => {
      const side = await harness.open();
      const book = (slot: string) =>
        side.persistence.transaction(async (scope) => {
          if ((await side.items.count({ name: slot }, { scope })) > 0) return false;
          // Yield between check and write: without serialization another caller would pass the same check.
          await new Promise((resolve) => setTimeout(resolve, 5));
          await side.items.insert({ name: slot }, { scope });
          return true;
        });
      const results = await Promise.all(Array.from({ length: 8 }, () => book('tx-race')));
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('shares one write queue with the host: plugin and core transactions never overlap', async () => {
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
    });

    describe('nesting', () => {
      const NESTED = /inside a transaction callback/;

      it('rejects a nested transaction without a deadlock; the outer write rolls back when the rejection propagates', async () => {
        const side = await harness.open();
        const outer = side.persistence.transaction(async (scope) => {
          await side.items.insert({ name: 'nest-outer' }, { scope });
          await side.persistence.transaction(async (inner) => void (await side.items.insert({ name: 'nest-inner' }, { scope: inner })));
        });
        await expect(withoutDeadlock(outer)).rejects.toThrow(NESTED);
        expect(await names(side, 'nest-')).toEqual([]);
        await withoutDeadlock(side.persistence.transaction(async () => undefined));
      });

      it('rejects a nested transaction; the outer write commits when the plugin catches the rejection', async () => {
        const side = await harness.open();
        let nested: unknown;
        await withoutDeadlock(
          side.persistence.transaction(async (scope) => {
            await side.items.insert({ name: 'nest2-outer' }, { scope });
            nested = await side.persistence.transaction(async () => 1).catch((error: unknown) => error);
          }),
        );
        expect((nested as Error).message).toMatch(NESTED);
        expect(await names(side, 'nest2-')).toEqual(['nest2-outer']);
      });

      it('rejects a write without the scope inside a transaction (it would wait for the callback itself)', async () => {
        const side = await harness.open();
        await withoutDeadlock(
          side.persistence.transaction(async (scope) => {
            await expect(side.items.insert({ name: 'nest3-unscoped' })).rejects.toBeInstanceOf(PluginStorageInvalid);
            await side.items.insert({ name: 'nest3-scoped' }, { scope });
          }),
        );
        expect(await names(side, 'nest3-')).toEqual(['nest3-scoped']);
      });
    });

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

      it("commits the plugin's rows with the host's unit of work through the scope hooks receive, and rolls them back with it", async () => {
        const side = await harness.open();
        await side.connection.unitOfWork.run(async (core) => {
          const hostScope = side.connection.hostScope(core);
          const resourceId = await side.connection.insertResource(core, 'uow-resource');
          await side.items.insert({ name: 'uow-kept' }, { scope: hostScope });
          // The plugin reads what the same unit wrote, and cannot defer work onto the host's transaction.
          expect(await side.items.count({ name: 'uow-kept' }, { scope: hostScope })).toBe(1);
          expect(await side.connection.hostData.resources.get(resourceId, hostScope)).toMatchObject({ name: 'uow-resource' });
          expect(() => hostScope.afterCommit(() => undefined)).toThrow(/owned by the host/);
          expect(await committed('uow-')).toEqual([]);
        });
        expect(await committed('uow-')).toEqual(['uow-kept']);

        await expect(
          side.connection.unitOfWork.run(async (core) => {
            await side.items.insert({ name: 'uow-lost' }, { scope: side.connection.hostScope(core) });
            throw new Error('core failed');
          }),
        ).rejects.toThrow('core failed');
        expect(await committed('uow-lost')).toEqual([]);
      });

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

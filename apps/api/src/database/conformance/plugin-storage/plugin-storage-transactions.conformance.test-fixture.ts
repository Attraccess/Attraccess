import { PluginStorageConflict, PluginStorageInvalid } from '@attraccess/plugins-backend-sdk';
import { PLUGIN, storageV3 } from './storage-declarations.test-fixture';
import { createHarness, type Harness } from './storage-harness.test-fixture';
import type { StorageBackendFixture } from './storage-fixture';

/** Fails the test instead of hanging when `promise` does not settle in time (a deadlock). */
async function withoutDeadlock<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('did not settle: deadlocked or queued')), 10_000);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** A gate a test opens to let a held transaction finish. */
function gate(): { opened: Promise<void>; open(): void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

/** Waits until `condition` holds (a transaction reached its callback, so it holds the plugin's lock). */
async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not reached');
    await new Promise((resolve) => setTimeout(resolve, 5));
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

    it('keeps the writes of a scope when a concurrent write through the same scope fails', async () => {
      const side = await harness.open();
      await side.items.insert({ name: 'scope-dup' });
      const outcomes = await side.persistence.transaction(async (scope) => {
        const results = await Promise.allSettled([
          side.items.insert({ name: 'scope-keep-a' }, { scope }),
          side.items.insert({ name: 'scope-dup' }, { scope }),
          side.items.insert({ name: 'scope-keep-b' }, { scope }),
          side.items.count({}, { scope }),
        ]);
        return results.map((result) => (result.status === 'rejected' ? result.reason.constructor.name : 'ok'));
      });
      expect(outcomes).toEqual(['ok', 'PluginStorageUniqueViolation', 'ok', 'ok']);
      expect(await committed('scope-')).toEqual(['scope-dup', 'scope-keep-a', 'scope-keep-b']);
    });

    describe('order of the transactions of one plugin', () => {
      it('runs parallel check-then-insert transactions one after the other: exactly one row', async () => {
        const sides = await Promise.all(Array.from({ length: 4 }, () => harness.open()));
        // `status` has no unique index: nothing but the order of the transactions keeps the check honest.
        const book = (side: (typeof sides)[number], index: number) =>
          side.persistence.transaction(async (scope) => {
            if ((await side.items.count({ status: 'order-slot' }, { scope })) > 0) return false;
            await new Promise((resolve) => setTimeout(resolve, 10));
            await side.items.insert({ name: `order-slot-${index}`, status: 'order-slot' }, { scope });
            return true;
          });
        const outcomes = await Promise.all(Array.from({ length: 8 }, (_, index) => book(sides[index % 4], index)));
        expect(outcomes.filter(Boolean)).toHaveLength(1);
        expect(await committed('order-slot-')).toHaveLength(1);
      });

      it("queues a write without scope behind the plugin's open transaction on another connection", async () => {
        const [holder, writer] = [await harness.open(), await harness.open()];
        const held = gate();
        const order: string[] = [];
        const transaction = holder.persistence.transaction(async (scope) => {
          await holder.items.insert({ name: 'order-queue-a' }, { scope });
          order.push('transaction:open');
          await held.opened;
          order.push('transaction:end');
        });
        await until(() => order.includes('transaction:open'));
        const write = writer.items.insert({ name: 'order-queue-b' }).then(() => void order.push('write'));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(order).toEqual(['transaction:open']);
        held.open();
        await Promise.all([transaction, write]);
        expect(order).toEqual(['transaction:open', 'transaction:end', 'write']);
        expect(await committed('order-queue-')).toEqual(['order-queue-a', 'order-queue-b']);
      });

      it("does not queue a write behind another plugin's transaction, nor core work behind the plugin's", async () => {
        const side = await harness.open();
        const other = side.connection.contexts('other-plugin', null).persistence;
        const held = gate();
        let opened = false;
        const foreign = other.transaction(async () => {
          opened = true;
          await held.opened;
        });
        await until(() => opened);
        await withoutDeadlock(side.items.insert({ name: 'order-free-write' }));
        expect(await committed('order-free-')).toEqual(['order-free-write']);
        // The plugin's own open transaction does not hold up a core unit of work either.
        const own = gate();
        let ownOpened = false;
        const plugin = side.persistence.transaction(async () => {
          ownOpened = true;
          await own.opened;
        });
        await until(() => ownOpened);
        await withoutDeadlock(side.connection.unitOfWork.run((core) => side.connection.insertResource(core, 'order')));
        held.open();
        own.open();
        await Promise.all([foreign, plugin]);
      });

      it('fails a transaction and a write with PluginStorageConflict when the lock wait passes the timeout', async () => {
        const holder = await harness.open();
        const connection = await harness.db.connect({ busyTimeoutMs: 200 });
        const tables = connection.contexts(PLUGIN, harness.compiled).storage.open(storageV3) as unknown as {
          items: { insert(row: object, options?: object): Promise<unknown> };
        };
        const { persistence } = connection.contexts(PLUGIN, harness.compiled);
        const held = gate();
        let opened = false;
        const transaction = holder.persistence.transaction(async () => {
          opened = true;
          await held.opened;
        });
        await until(() => opened);
        try {
          const work = jest.fn(async () => undefined);
          await expect(persistence.transaction(work)).rejects.toBeInstanceOf(PluginStorageConflict);
          expect(work).not.toHaveBeenCalled();
          await expect(tables.items.insert({ name: 'order-timeout' })).rejects.toBeInstanceOf(PluginStorageConflict);
        } finally {
          held.open();
          await transaction;
        }
        expect(await committed('order-timeout')).toEqual([]);
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

      // A plugin write or transaction started inside the host's transaction would take a second connection beside it.
      it("refuses at once a plugin write without scope or a plugin transaction inside the host's own transaction", async () => {
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

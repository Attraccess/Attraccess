import type { PluginTransactionScope } from './plugin-persistence';
import { PluginStorageInvalid, PluginStorageUniqueViolation } from './plugin-storage';
import type { OpenSide, StorageContractSide } from './plugin-storage-contract-fixture.test-cases';

/** Fails instead of hanging when `promise` does not settle in time (a call that waits for itself). */
async function settlesWithin<T>(promise: Promise<T>, ms = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`did not settle within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** A promise the test resolves, to hold a transaction open. */
function gate(): { opened: Promise<void>; open(): void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

const names = async (side: StorageContractSide, prefix: string, scope?: PluginTransactionScope) =>
  (await side.items.find({ where: { name: { startsWith: prefix } } }, { scope })).map(
    (row: { name: string }) => row.name,
  );

const NESTED = /inside a transaction callback/;

/** `context.persistence.transaction` with the record port: atomicity, visibility, scope rules. */
export function describeStorageContractTransactions(open: OpenSide): void {
  describe('transactions', () => {
    it('commits, then runs after-commit work in registration order', async () => {
      const side = await open();
      const order: string[] = [];
      const result = await side.persistence.transaction(async (scope) => {
        await side.items.insert({ name: 'tx-commit' }, { scope });
        expect(await side.items.count({ name: 'tx-commit' }, { scope })).toBe(1);
        scope.afterCommit(async () => void order.push(`first:${(await names(side, 'tx-commit')).length}`));
        scope.afterCommit(() => void order.push('second'));
        order.push('work');
        return 'done';
      });
      expect(result).toBe('done');
      expect(order).toEqual(['work', 'first:1', 'second']);
    });

    it('rolls back everything when the callback fails and never runs after-commit work', async () => {
      const side = await open();
      const after = jest.fn();
      await expect(
        side.persistence.transaction(async (scope) => {
          scope.afterCommit(after);
          await side.items.insert({ name: 'tx-lost-1' }, { scope });
          await side.items.update({ name: 'tx-lost-1' }, { qty: 5 }, { scope });
          throw new Error('overlap');
        }),
      ).rejects.toThrow('overlap');
      expect(await names(side, 'tx-lost')).toEqual([]);
      expect(after).not.toHaveBeenCalled();
      await settlesWithin(side.persistence.transaction(async () => undefined));
    });

    it('keeps a failing after-commit callback from undoing the commit or stopping the next one', async () => {
      const side = await open();
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
      const side = await open();
      await side.items.insert({ name: 'tx-unique' });
      await side.persistence.transaction(async (scope) => {
        await side.items.insert({ name: 'tx-unique-b' }, { scope });
        await expect(side.items.insert({ name: 'tx-unique' }, { scope })).rejects.toBeInstanceOf(
          PluginStorageUniqueViolation,
        );
        await side.items.insert({ name: 'tx-unique-c' }, { scope });
      });
      expect(await names(side, 'tx-unique')).toEqual(['tx-unique', 'tx-unique-b', 'tx-unique-c']);
    });

    it('closes the scope: a call with it after the transaction, or with a foreign scope, is refused', async () => {
      const side = await open();
      let kept!: PluginTransactionScope;
      await side.persistence.transaction(async (scope) => void (kept = scope));
      expect(kept.isOpen).toBe(false);
      await expect(side.items.count({}, { scope: kept })).rejects.toThrow(PluginStorageInvalid);
      await expect(side.items.count({}, { scope: kept })).rejects.toThrow(/closed/);
      await expect(side.items.insert({ name: 'tx-closed' }, { scope: kept })).rejects.toThrow(/closed/);
      expect(() => kept.afterCommit(() => undefined)).toThrow(/closed/);
      const forged = { isOpen: true, afterCommit: () => undefined };
      await expect(side.items.count({}, { scope: forged })).rejects.toThrow(PluginStorageInvalid);
      await expect(side.items.count({}, { scope: forged })).rejects.toThrow(/not created by the host/);
    });

    it('makes check-then-write sequences race-free across concurrent callers', async () => {
      const side = await open();
      const book = (slot: string) =>
        side.persistence.transaction(async (scope) => {
          if ((await side.items.count({ name: slot }, { scope })) > 0) return false;
          // Yield between check and write: without isolation another caller would pass the same check.
          await new Promise((resolve) => setTimeout(resolve, 5));
          await side.items.insert({ name: slot }, { scope });
          return true;
        });
      const results = await Promise.all(Array.from({ length: 8 }, () => book('tx-race')));
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('lets a read without scope run at once and see only committed rows while a transaction is open', async () => {
      const side = await open();
      const held = gate();
      const written = gate();
      const transaction = side.persistence.transaction(async (scope) => {
        await side.items.insert({ name: 'tx-open-row' }, { scope });
        written.open();
        await held.opened;
      });
      await written.opened;
      try {
        expect(await settlesWithin(names(side, 'tx-open-'))).toEqual([]);
      } finally {
        held.open();
      }
      await transaction;
      expect(await names(side, 'tx-open-')).toEqual(['tx-open-row']);
    });

    it('queues a write without scope behind an open transaction, as a transaction of its own', async () => {
      const side = await open();
      const held = gate();
      const order: string[] = [];
      const transaction = side.persistence.transaction(async (scope) => {
        await side.items.insert({ name: 'tx-queue-a' }, { scope });
        await held.opened;
        order.push('transaction');
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const write = side.items.insert({ name: 'tx-queue-b' }).then(() => void order.push('write'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      held.open();
      await Promise.all([transaction, write]);
      expect(order).toEqual(['transaction', 'write']);
      expect(await names(side, 'tx-queue-')).toEqual(['tx-queue-a', 'tx-queue-b']);
    });

    describe('inside a transaction callback', () => {
      it('rejects a nested transaction without a deadlock; the outer write rolls back when it propagates', async () => {
        const side = await open();
        const outer = side.persistence.transaction(async (scope) => {
          await side.items.insert({ name: 'nest-outer' }, { scope });
          await side.persistence.transaction(async (inner) => {
            await side.items.insert({ name: 'nest-inner' }, { scope: inner });
          });
        });
        await expect(settlesWithin(outer)).rejects.toThrow(PluginStorageInvalid);
        await expect(outer).rejects.toThrow(NESTED);
        expect(await names(side, 'nest-')).toEqual([]);
        await settlesWithin(side.persistence.transaction(async () => undefined));
      });

      it('rejects a nested transaction; the outer write commits when the plugin catches the rejection', async () => {
        const side = await open();
        let nested: unknown;
        await settlesWithin(
          side.persistence.transaction(async (scope) => {
            await side.items.insert({ name: 'nest2-outer' }, { scope });
            nested = await side.persistence.transaction(async () => 1).catch((error: unknown) => error);
          }),
        );
        expect(nested).toBeInstanceOf(PluginStorageInvalid);
        expect((nested as Error).message).toMatch(NESTED);
        expect(await names(side, 'nest2-')).toEqual(['nest2-outer']);
      });

      it('rejects a write without the scope (it would wait for the callback itself) and allows a read', async () => {
        const side = await open();
        await settlesWithin(
          side.persistence.transaction(async (scope) => {
            await expect(side.items.insert({ name: 'nest3-unscoped' })).rejects.toBeInstanceOf(PluginStorageInvalid);
            await expect(side.items.update({ name: 'nest3-none' }, { qty: 1 })).rejects.toBeInstanceOf(
              PluginStorageInvalid,
            );
            // Whether a read without scope sees the transaction's own writes depends on the backend: pass the scope.
            expect(typeof (await side.items.count())).toBe('number');
            await side.items.insert({ name: 'nest3-scoped' }, { scope });
          }),
        );
        expect(await names(side, 'nest3-')).toEqual(['nest3-scoped']);
      });

      it('allows a new transaction from an after-commit callback', async () => {
        const side = await open();
        let followUp: Promise<unknown> | undefined;
        await side.persistence.transaction(async (scope) => {
          await side.items.insert({ name: 'chain-1' }, { scope });
          scope.afterCommit(() => {
            followUp = side.persistence.transaction(async (next) =>
              side.items.insert({ name: 'chain-2' }, { scope: next }),
            );
          });
        });
        await settlesWithin(followUp as Promise<unknown>);
        expect(await names(side, 'chain-')).toEqual(['chain-1', 'chain-2']);
      });
    });
  });
}

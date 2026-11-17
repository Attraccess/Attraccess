import { createInMemoryPluginStorage } from './plugin-storage-memory';
import { PluginStorageInvalid } from './plugin-storage';
import { storage as definition } from './plugin-storage-memory.fixtures';

function setup(options = {}) {
  const fake = createInMemoryPluginStorage(definition, options);
  return { fake, db: fake.storage.open(definition), tx: fake.persistence.transaction.bind(fake.persistence) };
}

describe('in-memory plugin storage: transactions', () => {
  it('commits writes made with the scope and returns the result', async () => {
    const { db, tx } = setup();
    const result = await tx(async (scope) => {
      expect(scope.isOpen).toBe(true);
      await db.items.insert({ name: 'a' }, { scope });
      return (await db.items.count(undefined, { scope })) + 41;
    });
    expect(result).toBe(42);
    expect(await db.items.count()).toBe(1);
  });

  it('rolls everything back when the work throws, generated keys included, and rethrows', async () => {
    const { db, tx } = setup();
    await db.items.insert({ name: 'keep' });
    const after = jest.fn();
    await expect(
      tx(async (scope) => {
        await db.items.insert({ name: 'gone' }, { scope });
        await db.items.update({ id: 1 }, { qty: 99 }, { scope });
        scope.afterCommit(after);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.items.count()).toBe(1);
    expect((await db.items.get(1))?.qty).toBe(0);
    expect((await db.items.insert({ name: 'next' })).id).toBe(2);
    expect(after).not.toHaveBeenCalled();
  });

  it('rolls back when a call inside fails with a storage error that the work does not catch', async () => {
    const { db, tx } = setup();
    await expect(
      tx(async (scope) => {
        await db.items.insert({ name: 'a', sku: 'x' }, { scope });
        await db.items.insert({ name: 'b', sku: 'x' }, { scope });
      }),
    ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    expect(await db.items.count()).toBe(0);
  });

  it('keeps earlier writes when the work catches a failed statement (statements are atomic)', async () => {
    const { db, tx } = setup();
    await tx(async (scope) => {
      await db.items.insert({ name: 'a', sku: 'x' }, { scope });
      await db.items.insert({ name: 'b', sku: 'x' }, { scope }).catch(() => undefined);
    });
    expect(await db.items.count()).toBe(1);
  });

  it('runs afterCommit callbacks in order after the commit, outside the transaction', async () => {
    const { db, tx } = setup();
    const seen: string[] = [];
    await tx(async (scope) => {
      scope.afterCommit(async () => {
        seen.push(`first:${await db.items.count()}`);
        await tx(async (inner) => {
          await db.items.insert({ name: 'from-callback' }, { scope: inner });
        });
      });
      scope.afterCommit(() => {
        seen.push('second');
      });
      await db.items.insert({ name: 'a' }, { scope });
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(['first:1', 'second']);
    expect(await db.items.count()).toBe(2);
  });

  it('logs a failing callback without undoing the commit or stopping later callbacks', async () => {
    const onAfterCommitError = jest.fn();
    const { fake, db, tx } = setup({ onAfterCommitError });
    const later = jest.fn();
    await tx(async (scope) => {
      await db.items.insert({ name: 'a' }, { scope });
      scope.afterCommit(() => {
        throw new Error('callback failed');
      });
      scope.afterCommit(later);
    });
    expect(later).toHaveBeenCalled();
    expect(await db.items.count()).toBe(1);
    expect(onAfterCommitError).toHaveBeenCalledWith(expect.objectContaining({ message: 'callback failed' }));
    expect(fake.afterCommitErrors).toHaveLength(1);
  });

  it('serializes transactions and hides uncommitted data from calls outside', async () => {
    const { db, tx } = setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = tx(async (scope) => {
      await db.items.insert({ name: 'a' }, { scope });
      await gate;
    });
    const outsideRead = db.items.count();
    const second = tx(async (scope) => db.items.count(undefined, { scope }));
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await first;
    expect(await outsideRead).toBe(1);
    expect(await second).toBe(1);
  });

  it('lets a check-then-write sequence run without interleaving', async () => {
    const { db, tx } = setup();
    const claim = (name: string) =>
      tx(async (scope) => {
        if ((await db.items.count({ sku: 'slot' }, { scope })) > 0) return false;
        await db.items.insert({ name, sku: 'slot' }, { scope });
        return true;
      });
    expect(await Promise.all([claim('a'), claim('b'), claim('c')])).toEqual([true, false, false]);
  });

  it('refuses a nested transaction, a call without the scope inside, and a scope that ended', async () => {
    const { db, tx } = setup();
    let ended: Parameters<Parameters<typeof tx>[0]>[0] | undefined;
    await tx(async (scope) => {
      ended = scope;
      await expect(tx(async () => undefined)).rejects.toThrow(/inside another/);
      await expect(db.items.count()).rejects.toBeInstanceOf(PluginStorageInvalid);
    });
    expect(ended?.isOpen).toBe(false);
    await expect(db.items.count(undefined, { scope: ended })).rejects.toBeInstanceOf(PluginStorageInvalid);
    expect(() => ended?.afterCommit(() => undefined)).toThrow(PluginStorageInvalid);
  });

  it('refuses a scope of another storage and a scope that is not a transaction scope', async () => {
    const one = setup();
    const two = setup();
    await one.tx(async (scope) => {
      await expect(two.db.items.count(undefined, { scope })).rejects.toBeInstanceOf(PluginStorageInvalid);
    });
    await expect(
      one.db.items.count(undefined, { scope: { isOpen: true, afterCommit: () => undefined } }),
    ).rejects.toBeInstanceOf(PluginStorageInvalid);
  });

  it('reports synchronous failures of a scoped call as a rejection, not a throw', async () => {
    const { db, tx } = setup();
    await tx(async (scope) => {
      await expect(db.items.get({ nope: 1 } as never, { scope })).rejects.toBeInstanceOf(PluginStorageInvalid);
    });
  });
});

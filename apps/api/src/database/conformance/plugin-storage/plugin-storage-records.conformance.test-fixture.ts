import {
  PluginStorageConflict,
  PluginStorageInvalid,
  increment,
  type PluginTransactionScope,
} from '@attraccess/plugins-backend-sdk';
import { PLUGIN, storageV3 } from './storage-declarations.test-fixture';
import { createHarness, type Harness } from './storage-harness.test-fixture';
import type { StorageBackendFixture } from './storage-fixture';

const ITEMS = 'plugin_conformance_plugin_items';

/**
 * Conformance of the record port on real database connections, for what only a real engine shows: independent
 * connections racing, a busy database, values written by other software, engine limits. The backend-neutral
 * behaviour (values, filters, writes, transactions) is the SDK's contract suite, which runs on every backend and on
 * the in-memory fake (see plugin-storage-contract.conformance.test-fixture.ts).
 */
export function describePluginStorageRecords(fixture: StorageBackendFixture): void {
  describe(`plugin storage record port on real connections (${fixture.name})`, () => {
    let harness: Harness;
    beforeAll(async () => {
      harness = await createHarness(fixture);
    });
    afterAll(() => harness.db.close());

    it('claims a row exactly once when writers race on independent connections (compare-and-set)', async () => {
      const writers = [await harness.open(), await harness.open(), await harness.open()];
      const row = await writers[0].items.insert({ name: 'lease', status: 'pending' });
      const results = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          writers[index % writers.length].items.update(
            { id: row.id, status: 'pending' },
            { status: `claimed-by-${index}` },
          ),
        ),
      );
      expect(results.filter((changed: number) => changed === 1)).toHaveLength(1);
      expect((await writers[0].items.get(row.id)).status).toMatch(/^claimed-by-/);
    });

    it('adds atomically: concurrent increments from two connections lose none', async () => {
      const [a, b] = [await harness.open(), await harness.open()];
      const row = await a.items.insert({ name: 'counter' });
      await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          (index % 2 ? a : b).items.update({ id: row.id }, { qty: increment(1) }),
        ),
      );
      expect((await a.items.get(row.id)).qty).toBe(40);
    });

    // PostgreSQL does not serialise transactions (READ COMMITTED): a plugin races with compare-and-set instead.
    (fixture.flavor === 'sqlite' ? it : it.skip)(
      'serialises check-then-write transactions of independent connections',
      async () => {
        const [a, b] = [await harness.open(), await harness.open()];
        const slot = 'slot-' + Date.now();
        let sequence = 0;
        const book = (side: typeof a) =>
          side.persistence.transaction(async (scope) => {
            if ((await side.items.count({ status: slot }, { scope })) > 0) return false;
            await side.items.insert({ name: `${slot}-${++sequence}`, status: slot }, { scope });
            return true;
          });
        const outcomes = await Promise.all([book(a), book(b), book(a), book(b)]);
        expect(outcomes.filter(Boolean)).toHaveLength(1);
        expect(await a.items.count({ status: slot })).toBe(1);
      },
    );

    // PostgreSQL text cannot hold arbitrary bytes, so there is no such column to adopt.
    (fixture.flavor === 'sqlite' ? it : it.skip)(
      'reads binary data in a text field (an adopted 1.x blob column) as base64, byte for byte',
      async () => {
        const { items } = await harness.open();
        const row = await items.insert({ name: 'legacy-blob' });
        // Every byte value, including ones that are no valid UTF-8 on their own.
        const bytes = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
        await harness.db.execute(`UPDATE ${ITEMS} SET note = X'${bytes.toString('hex')}' WHERE id = ${row.id}`);
        const [stored] = await harness.db.committed(`SELECT typeof(note) AS type FROM ${ITEMS} WHERE id = ${row.id}`);
        expect(stored.type).toBe('blob');
        const read = (await items.get(row.id)).note as string;
        expect(Buffer.from(read, 'base64').equals(bytes)).toBe(true);
      },
    );

    it('refuses a call that binds more values than the engine takes, before it reaches the engine', async () => {
      const { items } = await harness.open();
      const values = (count: number) => Array.from({ length: count }, (_, index) => index);
      // The engine's bind limit: SQLite 32766, PostgreSQL 65535.
      const limit = fixture.flavor === 'sqlite' ? 32_766 : 65_535;
      expect(await items.count({ qty: { in: values(limit - 2_000) } })).toBeGreaterThan(0);
      const tooMany = items.count({ qty: { in: values(limit + 7_000) } });
      await expect(tooMany).rejects.toBeInstanceOf(PluginStorageInvalid);
      await expect(items.count({ qty: { in: values(limit + 7_000) } })).rejects.toThrow(/at most \d+ values/);
    });

    describe('a busy database', () => {
      it('fails a write and a transaction with PluginStorageConflict when the lock stays taken past the timeout', async () => {
        const connection = await harness.db.connect({ busyTimeoutMs: 200 });
        const { persistence, storage } = connection.contexts(PLUGIN, harness.compiled);
        const tables = storage.open(storageV3) as unknown as {
          items: { insert(row: object, options?: object): Promise<unknown>; count(): Promise<number> };
        };
        const release = await harness.db.holdWriteLock();
        try {
          const write = await tables.items.insert({ name: 'busy-write' }).catch((error: unknown) => error);
          expect(write).toBeInstanceOf(PluginStorageConflict);
          expect((write as Error).message).not.toMatch(/SQLITE|INSERT|plugin_/);
          // A transaction takes the lock when it first writes (SQLite: when it begins); `work` writes through its scope.
          const work = jest.fn((scope: PluginTransactionScope) => tables.items.insert({ name: 'busy-tx' }, { scope }));
          const transaction = await persistence.transaction(work).catch((error: unknown) => error);
          expect(transaction).toBeInstanceOf(PluginStorageConflict);
          expect((transaction as Error).message).not.toMatch(/SQLITE|BEGIN/);
          // Reads do not need the write lock.
          expect(await tables.items.count()).toBeGreaterThanOrEqual(0);
        } finally {
          await release();
        }
        await expect(tables.items.insert({ name: 'busy-after' })).resolves.toMatchObject({ name: 'busy-after' });
      });
    });
  });
}

import { increment, PluginStorageInvalid, PluginStorageUniqueViolation } from './plugin-storage';
import type { OpenSide } from './plugin-storage-contract-fixture.test-cases';

/** Inserts, updates, upserts and deletes: their results, their atomicity and their refusals. */
export function describeStorageContractWrites(open: OpenSide): void {
  describe('writes', () => {
    it('rejects a duplicate unique key neutrally, for insert, insertMany (atomically) and upsert', async () => {
      const { items } = await open();
      await items.insert({ name: 'unique-1' });
      await expect(items.insert({ name: 'unique-1' })).rejects.toBeInstanceOf(PluginStorageUniqueViolation);
      const before = await items.count();
      await expect(items.insertMany([{ name: 'unique-2' }, { name: 'unique-1' }])).rejects.toBeInstanceOf(
        PluginStorageUniqueViolation,
      );
      await expect(items.insertMany([{ name: 'unique-3' }, { name: 'unique-3' }])).rejects.toBeInstanceOf(
        PluginStorageUniqueViolation,
      );
      await expect(items.insertMany([{ name: 'unique-4' }, { name: 'unique-5', qty: 'x' }])).rejects.toBeInstanceOf(
        PluginStorageInvalid,
      );
      expect(await items.count()).toBe(before);
      const caught = await items.insert({ name: 'unique-1' }).catch((error: unknown) => error);
      expect(String((caught as Error).message)).not.toMatch(/INSERT|SQLITE|plugin_|constraint/i);
    });

    it('inserts many rows in order with their generated keys', async () => {
      const { items } = await open();
      expect(await items.insertMany([])).toEqual([]);
      const rows = await items.insertMany([{ name: 'many-1' }, { name: 'many-2', qty: 2 }, { name: 'many-3' }]);
      expect(rows.map((row: { name: string }) => row.name)).toEqual(['many-1', 'many-2', 'many-3']);
      expect(rows[1].id).toBe(rows[0].id + 1);
      expect(rows[2].id).toBe(rows[1].id + 1);
      expect(await items.get(rows[1].id)).toEqual(rows[1]);
    });

    it('upserts on a unique key; `update` limits what is overwritten', async () => {
      const { items } = await open();
      const first = await items.upsert({ name: 'ups', qty: 1, status: 's1' }, { conflictOn: ['name'] });
      expect(first).toMatchObject({ name: 'ups', qty: 1, status: 's1' });
      const again = await items.upsert({ name: 'ups', qty: 2 }, { conflictOn: ['name'] });
      expect(again).toMatchObject({ id: first.id, qty: 2, status: 'new' });
      const kept = await items.upsert(
        { name: 'ups', qty: 3, status: 's3' },
        { conflictOn: ['name'], update: ['status'] },
      );
      expect(kept).toMatchObject({ id: first.id, qty: 2, status: 's3' });
      const untouched = await items.upsert({ name: 'ups', qty: 4 }, { conflictOn: ['name'], update: [] });
      expect(untouched).toMatchObject({ id: first.id, qty: 2, status: 's3' });
      // Default: every non-key field is overwritten, fields the row omits take their defaults.
      expect(await items.upsert({ name: 'ups', qty: 9 }, { conflictOn: ['name'] })).toMatchObject({
        id: first.id,
        qty: 9,
        status: 'new',
      });
      expect(await items.count({ name: 'ups' })).toBe(1);
      const byKey = await items.upsert({ id: first.id, name: 'ups-renamed' }, { conflictOn: ['id'] });
      expect(byKey).toMatchObject({ id: first.id, name: 'ups-renamed' });
    });

    it('refuses an upsert without a value for its key, on a non-unique key or overwriting the key', async () => {
      const { items } = await open();
      const refuse = (row: object, options: unknown) =>
        expect(items.upsert(row, options)).rejects.toBeInstanceOf(PluginStorageInvalid);
      await refuse({ name: 'ups2' }, { conflictOn: ['qty'] });
      await refuse({ name: 'ups2' }, { conflictOn: ['id'] });
      await refuse({ name: 'ups2', status: 'x' }, { conflictOn: [] });
      await refuse({ name: 'ups2' }, undefined);
      await refuse({ name: 'ups2' }, { conflictOn: ['name'], update: ['name'] });
      await refuse({ name: 'ups2' }, { conflictOn: ['name'], update: ['id'] });
      await refuse({ name: 'ups2' }, { conflictOn: ['name'], update: ['nope'] });
      expect(await items.count({ name: 'ups2' })).toBe(0);
    });

    it('updates by condition and returns the number of changed rows (compare-and-set)', async () => {
      const { items } = await open();
      const row = await items.insert({ name: 'upd', status: 'pending', qty: 5 });
      expect(await items.update({ id: row.id, status: 'pending' }, { status: 'done', qty: increment(2) })).toBe(1);
      expect(await items.update({ id: row.id, status: 'pending' }, { status: 'again' })).toBe(0);
      expect(await items.get(row.id)).toMatchObject({ status: 'done', qty: 7 });
      expect(await items.update({ id: row.id }, { note: 'x', score: undefined })).toBe(1);
      const refuse = (patch: object) =>
        expect(items.update({ id: row.id }, patch)).rejects.toBeInstanceOf(PluginStorageInvalid);
      await refuse({ id: 99 });
      await refuse({});
      await refuse({ status: increment(1) });
      await refuse({ qty: increment(1.5) });
      await refuse({ nope: 1 });
      await refuse({ name: null });
      await expect(items.update({ id: row.id }, null)).rejects.toBeInstanceOf(PluginStorageInvalid);
    });

    it('increments NULL as 0', async () => {
      const { items } = await open();
      const row = await items.insert({ name: 'inc-null' });
      expect(row.score).toBeNull();
      expect(await items.update({ id: row.id }, { score: increment(3) })).toBe(1);
      expect(await items.update({ id: row.id }, { score: increment(-1) })).toBe(1);
      expect((await items.get(row.id)).score).toBe(2);
    });

    it('applies an update or delete without a filter (or with {}) to every row', async () => {
      const { pairs } = await open();
      await pairs.insertMany([
        { a: 'all', b: 1 },
        { a: 'all', b: 2 },
      ]);
      const total = await pairs.count();
      expect(await pairs.count({})).toBe(total);
      expect(await pairs.update({}, { label: 'every' })).toBe(total);
      expect(await pairs.count({ label: 'every' })).toBe(total);
      expect(await pairs.update(undefined, { label: 'again' })).toBe(total);
      expect(await pairs.delete({})).toBe(total);
      expect(await pairs.count()).toBe(0);
      await pairs.insert({ a: 'all', b: 3 });
      expect(await pairs.delete(undefined)).toBe(1);
    });

    it('keeps foreign keys between own tables: a dangling reference is refused, a delete cascades', async () => {
      const { items, notes } = await open();
      const parent = await items.insert({ name: 'fk-parent' });
      await notes.insertMany([
        { itemId: parent.id, body: 'one' },
        { itemId: parent.id, body: 'two' },
      ]);
      await expect(notes.insert({ itemId: 987654321, body: 'orphan' })).rejects.toBeInstanceOf(PluginStorageInvalid);
      expect(await items.delete({ id: parent.id })).toBe(1);
      expect(await notes.count({ itemId: parent.id })).toBe(0);
    });

    it('aggregates integer, decimal, timestamp and date fields only', async () => {
      const { items } = await open();
      await items.insertMany([
        { name: 'agg-1', qty: 3, due: '2026-01-02', status: 'agg' },
        { name: 'agg-2', qty: 4, status: 'agg' },
      ]);
      expect(await items.aggregate('qty', { status: 'agg' })).toEqual({ min: 3, max: 4, sum: 7, count: 2 });
      expect(await items.aggregate('due', { status: 'agg' })).toEqual({
        min: '2026-01-02',
        max: '2026-01-02',
        sum: null,
        count: 2,
      });
      await expect(items.aggregate('name')).rejects.toBeInstanceOf(PluginStorageInvalid);
      await expect(items.aggregate('active')).rejects.toBeInstanceOf(PluginStorageInvalid);
    });
  });
}

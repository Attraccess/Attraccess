import { PluginStorageInvalid, PluginStorageUniqueViolation, increment } from '@attraccess/plugins-backend-sdk';
import { createHarness, type Harness } from './storage-harness.test-fixture';
import type { StorageBackendFixture } from './storage-fixture';

const UUID = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';

/**
 * Conformance of the record port: what a plugin can read and write through `context.storage`, on real database
 * connections. The suite only knows the neutral contract; a backend supplies a fixture.
 */
export function describePluginStorageRecords(fixture: StorageBackendFixture): void {
  describe(`plugin storage record port (${fixture.name})`, () => {
    let harness: Harness;
    beforeAll(async () => {
      harness = await createHarness(fixture);
    });
    afterAll(() => harness.db.close());

    describe('values', () => {
      it('round-trips every field type exactly and fills defaults and generated keys', async () => {
        const { items } = await harness.open();
        const due = '2026-02-28';
        const created = new Date('2026-11-17T10:20:30.456Z');
        const meta = { nested: { list: [1, 'two', null, true] }, text: 'ü "quoted" \'single\'' };
        const inserted = await items.insert({ name: 'values', price: '1234567.89', due, meta, ref: UUID, created });
        expect(inserted).toEqual({
          id: expect.any(Number),
          name: 'values',
          qty: 0,
          price: '1234567.89',
          active: true,
          created,
          due,
          meta,
          ref: UUID.toLowerCase(),
          status: 'new',
          note: null,
        });
        expect(await items.get(inserted.id)).toEqual(inserted);
        const second = await items.insert({ name: 'values-2' });
        expect(second.id).toBeGreaterThan(inserted.id);
        expect(second.created).toBeInstanceOf(Date);
        expect(Math.abs(second.created.getTime() - Date.now())).toBeLessThan(60_000);
      });

      it('keeps decimals exact: no rounding, trailing zeros, sums without float drift', async () => {
        const { items } = await harness.open();
        await items.insert({ name: 'dec-a', price: '0.10', status: 'dec' });
        await items.insert({ name: 'dec-b', price: '0.20', status: 'dec' });
        await items.insert({ name: 'dec-c', price: '-5.5', status: 'dec' });
        expect((await items.get((await items.findOne({ where: { name: 'dec-c' } })).id)).price).toBe('-5.50');
        const total = await items.aggregate('price', { status: 'dec' });
        expect(total).toMatchObject({ sum: '-5.20', min: '-5.50', max: '0.20', count: 3 });
        await expect(items.insert({ name: 'dec-d', price: '1.005' })).rejects.toBeInstanceOf(PluginStorageInvalid);
        await expect(items.insert({ name: 'dec-e', price: '123456789.00' })).rejects.toBeInstanceOf(
          PluginStorageInvalid,
        );
        await expect(items.insert({ name: 'dec-f', price: 1.5 })).rejects.toBeInstanceOf(PluginStorageInvalid);
      });

      it('stores timestamps as UTC instants with millisecond precision', async () => {
        const { items } = await harness.open();
        const instant = new Date('1999-12-31T23:59:59.001Z');
        const row = await items.insert({ name: 'ts', created: instant });
        expect((await items.get(row.id)).created.getTime()).toBe(instant.getTime());
        expect(
          await items.count({
            created: { between: [new Date('1999-12-31T23:59:59.000Z'), new Date('2000-01-01T00:00:00Z')] },
          }),
        ).toBe(1);
        await expect(items.insert({ name: 'ts-bad', created: new Date('nope') })).rejects.toBeInstanceOf(
          PluginStorageInvalid,
        );
      });

      it('rejects values a field cannot hold', async () => {
        const { items } = await harness.open();
        const reject = (row: object) => expect(items.insert(row)).rejects.toBeInstanceOf(PluginStorageInvalid);
        await reject({});
        await reject({ name: 'x'.repeat(41) });
        await reject({ name: 'n1', qty: 1.5 });
        await reject({ name: 'n2', qty: Number.MAX_SAFE_INTEGER + 1 });
        await reject({ name: 'n3', active: 'yes' });
        await reject({ name: 'n4', due: '2026-02-30' });
        await reject({ name: 'n5', ref: 'not-a-uuid' });
        await reject({ name: 'n6', meta: { bad: Number.NaN } });
        await reject({ name: 'n7', meta: { fn: () => 1 } });
        await reject({ name: 'n8', unknownField: 1 });
        await reject({ name: null });
      });

      it('never lets a value act as SQL', async () => {
        const { items } = await harness.open();
        const hostile = `x'); DROP TABLE plugin_conformance_plugin_items; --`;
        const row = await items.insert({ name: hostile.slice(0, 40), status: hostile.slice(0, 20) });
        expect((await items.get(row.id)).name).toBe(hostile.slice(0, 40));
        expect(await items.count({ status: hostile.slice(0, 20) })).toBe(1);
        expect(await items.count()).toBeGreaterThan(0);
      });
    });

    describe('queries', () => {
      beforeAll(async () => {
        const { items } = await harness.open();
        await items.insertMany(
          ['alpha', 'Alpha2', 'alphabet', 'beta', 'gamma', 'delta'].map((name, index) => ({
            name,
            qty: index * 10,
            status: 'q',
            due: index % 2 === 0 ? `2026-03-0${index + 1}` : undefined,
          })),
        );
      });

      const names = async (query: object) => {
        const { items } = await harness.open();
        return (
          await items.find({ ...query, where: { status: 'q', ...((query as { where?: object }).where ?? {}) } })
        ).map((row: { name: string }) => row.name);
      };

      it('filters with every operator and the combinators', async () => {
        const byQty = [{ field: 'qty' }];
        expect(await names({ where: { qty: 20 } })).toEqual(['alphabet']);
        expect(await names({ where: { qty: { ne: 20 } }, orderBy: byQty })).toHaveLength(5);
        expect(await names({ where: { qty: { in: [0, 10] } }, orderBy: byQty })).toEqual(['alpha', 'Alpha2']);
        expect(await names({ where: { qty: { notIn: [0, 10, 20, 30] } }, orderBy: byQty })).toEqual(['gamma', 'delta']);
        expect(await names({ where: { qty: { gt: 10, lte: 30 } }, orderBy: byQty })).toEqual(['alphabet', 'beta']);
        expect(await names({ where: { qty: { between: [10, 20] } }, orderBy: byQty })).toEqual(['Alpha2', 'alphabet']);
        expect(await names({ where: { due: { isNull: true } }, orderBy: byQty })).toEqual(['Alpha2', 'beta', 'delta']);
        expect(await names({ where: { or: [{ qty: 0 }, { qty: 50 }] }, orderBy: byQty })).toEqual(['alpha', 'delta']);
        expect(
          await names({ where: { and: [{ qty: { gte: 10 } }, { not: { qty: { gte: 30 } } }] }, orderBy: byQty }),
        ).toEqual(['Alpha2', 'alphabet']);
        expect(await names({ where: { or: [] } })).toEqual([]);
        expect(await names({ where: { qty: { in: [] } } })).toEqual([]);
      });

      it('matches prefixes case-sensitively', async () => {
        expect(await names({ where: { name: { startsWith: 'alpha' } }, orderBy: [{ field: 'name' }] })).toEqual([
          'alpha',
          'alphabet',
        ]);
        expect(await names({ where: { name: { startsWith: 'Alpha' } } })).toEqual(['Alpha2']);
        expect(await names({ where: { name: { startsWith: '%' } } })).toEqual([]);
      });

      it('follows SQL three-valued logic: rows without a value never match ne, notIn or not', async () => {
        expect(await names({ where: { due: { ne: '2026-03-01' } } })).toHaveLength(2);
        expect(await names({ where: { due: { notIn: ['2026-03-01'] } } })).toHaveLength(2);
        expect(await names({ where: { not: { due: '2026-03-01' } } })).toHaveLength(2);
        expect(await names({ where: { due: { ne: null } } })).toHaveLength(3);
        expect(await names({ where: { due: { isNull: true } } })).toHaveLength(3);
        expect(await names({ where: { due: { in: ['2026-03-01', null] } } })).toHaveLength(4);
      });

      it('rejects an undefined filter value instead of ignoring it', async () => {
        const { items } = await harness.open();
        await expect(items.find({ where: { qty: undefined } })).rejects.toBeInstanceOf(PluginStorageInvalid);
        await expect(items.find({ where: { qty: { gt: undefined } } })).rejects.toBeInstanceOf(PluginStorageInvalid);
      });

      it('orders (nulls lowest), breaks ties by key and paginates stably', async () => {
        expect(await names({ orderBy: [{ field: 'due' }, { field: 'name', direction: 'desc' }] })).toEqual([
          'delta',
          'beta',
          'Alpha2',
          'alpha',
          'alphabet',
          'gamma',
        ]);
        expect(
          await names({ orderBy: [{ field: 'due', direction: 'desc' }, { field: 'name' }] }).then((rows) =>
            rows.slice(-3),
          ),
        ).toEqual(['Alpha2', 'beta', 'delta']);
        const all = await names({ orderBy: [{ field: 'qty' }] });
        expect(await names({ orderBy: [{ field: 'qty' }], limit: 2, offset: 1 })).toEqual(all.slice(1, 3));
        expect(await names({ orderBy: [{ field: 'qty' }], offset: 4 })).toEqual(all.slice(4));
        expect(await names({ limit: 0 })).toEqual([]);
      });

      it('findOne, get by key, count and delete answer for their rows only', async () => {
        const { items } = await harness.open();
        expect(await items.findOne({ where: { name: 'nothing-here' } })).toBeNull();
        expect(await items.get(987654321)).toBeNull();
        expect(await items.count({ status: 'q', qty: { gte: 30 } })).toBe(3);
        const doomed = await items.insert({ name: 'doomed' });
        expect(await items.delete({ id: doomed.id })).toBe(1);
        expect(await items.delete({ id: doomed.id })).toBe(0);
      });

      it('refuses undeclared fields, unknown operators and operators a type does not have', async () => {
        const { items } = await harness.open();
        const bad = (query: object) => expect(items.find(query)).rejects.toBeInstanceOf(PluginStorageInvalid);
        await bad({ where: { nope: 1 } });
        await bad({ where: { 'qty" = 1 OR "1': 1 } });
        await bad({ where: { qty: { like: '%' } } });
        await bad({ where: { meta: { eq: { a: 1 } } } });
        await bad({ where: { active: { gt: true } } });
        await bad({ where: { qty: { between: [1] } } });
        await bad({ where: { qty: { in: 'nope' } } });
        await bad({ orderBy: [{ field: 'meta' }] });
        await bad({ orderBy: [{ field: 'qty', direction: 'sideways' }] });
        await bad({ limit: -1 });
        await bad({ limit: 1.5 });
      });
    });

    describe('writes', () => {
      it('rejects a duplicate unique key neutrally, for insert, insertMany and upsert', async () => {
        const { items } = await harness.open();
        await items.insert({ name: 'unique-1' });
        await expect(items.insert({ name: 'unique-1' })).rejects.toBeInstanceOf(PluginStorageUniqueViolation);
        const before = await items.count();
        await expect(items.insertMany([{ name: 'unique-2' }, { name: 'unique-1' }])).rejects.toBeInstanceOf(
          PluginStorageUniqueViolation,
        );
        expect(await items.count()).toBe(before);
        let caught: unknown;
        await items.insert({ name: 'unique-1' }).catch((error: unknown) => (caught = error));
        expect(String((caught as Error).message)).not.toMatch(/INSERT|SQLITE|plugin_conformance/);
      });

      it('upserts on a unique key; `update` limits what is overwritten', async () => {
        const { items } = await harness.open();
        const first = await items.upsert({ name: 'ups', qty: 1, status: 's1' }, { conflictOn: ['name'] });
        const again = await items.upsert({ name: 'ups', qty: 2 }, { conflictOn: ['name'] });
        expect(again).toMatchObject({ id: first.id, qty: 2, status: 'new' });
        const kept = await items.upsert(
          { name: 'ups', qty: 3, status: 's3' },
          { conflictOn: ['name'], update: ['status'] },
        );
        expect(kept).toMatchObject({ id: first.id, qty: 2, status: 's3' });
        // Default: every non-key field is overwritten, fields the row omits take their defaults.
        const reset = await items.upsert({ name: 'ups', qty: 9 }, { conflictOn: ['name'] });
        expect(reset).toMatchObject({ id: first.id, qty: 9, status: 'new' });
        expect(await items.count({ name: 'ups' })).toBe(1);
        await expect(items.upsert({ name: 'ups2' }, { conflictOn: ['qty'] })).rejects.toBeInstanceOf(
          PluginStorageInvalid,
        );
      });

      it('updates by condition and returns the number of changed rows', async () => {
        const { items } = await harness.open();
        const row = await items.insert({ name: 'upd', status: 'pending', qty: 5 });
        expect(await items.update({ id: row.id, status: 'pending' }, { status: 'done', qty: increment(2) })).toBe(1);
        expect(await items.update({ id: row.id, status: 'pending' }, { status: 'again' })).toBe(0);
        expect(await items.get(row.id)).toMatchObject({ status: 'done', qty: 7 });
        await expect(items.update({ id: row.id }, { id: 99 })).rejects.toBeInstanceOf(PluginStorageInvalid);
        await expect(items.update({ id: row.id }, {})).rejects.toBeInstanceOf(PluginStorageInvalid);
        await expect(items.update({ id: row.id }, { status: increment(1) })).rejects.toBeInstanceOf(
          PluginStorageInvalid,
        );
      });

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

      it('serialises check-then-write transactions of independent connections', async () => {
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
      });
    });
  });
}

import { PluginStorageInvalid } from './plugin-storage';
import type { OpenSide } from './plugin-storage-contract-fixture.test-cases';

/** Seeded rows of status `q`, in insertion (and so key) order. */
const SEED = ['alpha', 'Alpha2', 'alphabet', 'beta', 'gamma', 'delta'];

/** Filters, orders and pages: which rows a query selects, and which queries are refused. */
export function describeStorageContractQueries(open: OpenSide): void {
  describe('queries', () => {
    beforeAll(async () => {
      const { items } = await open();
      await items.insertMany(
        SEED.map((name, index) => ({
          name,
          qty: index * 10,
          score: index % 3 === 0 ? undefined : index,
          status: 'q',
          due: index % 2 === 0 ? `2026-03-0${index + 1}` : undefined,
        })),
      );
    });

    const names = async (query: { where?: object; orderBy?: object[]; limit?: number; offset?: number }) => {
      const { items } = await open();
      const rows = await items.find({ ...query, where: { status: 'q', ...(query.where ?? {}) } });
      return rows.map((row: { name: string }) => row.name);
    };
    const invalid = async (query: object) => {
      const { items } = await open();
      await expect(items.find(query)).rejects.toBeInstanceOf(PluginStorageInvalid);
    };

    it('filters with every operator and the combinators', async () => {
      const byQty = [{ field: 'qty' }];
      expect(await names({ where: { qty: 20 } })).toEqual(['alphabet']);
      expect(await names({ where: { qty: { eq: 20 } } })).toEqual(['alphabet']);
      expect(await names({ where: { qty: { ne: 20 } }, orderBy: byQty })).toHaveLength(5);
      expect(await names({ where: { qty: { in: [0, 10] } }, orderBy: byQty })).toEqual(['alpha', 'Alpha2']);
      expect(await names({ where: { qty: { notIn: [0, 10, 20, 30] } }, orderBy: byQty })).toEqual(['gamma', 'delta']);
      expect(await names({ where: { qty: { gt: 10, lte: 30 } }, orderBy: byQty })).toEqual(['alphabet', 'beta']);
      expect(await names({ where: { qty: { lt: 10 } } })).toEqual(['alpha']);
      expect(await names({ where: { qty: { gte: 50 } } })).toEqual(['delta']);
      expect(await names({ where: { qty: { between: [10, 20] } }, orderBy: byQty })).toEqual(['Alpha2', 'alphabet']);
      expect(await names({ where: { due: { isNull: true } }, orderBy: byQty })).toEqual(['Alpha2', 'beta', 'delta']);
      expect(await names({ where: { due: { isNull: false } } })).toEqual(['alpha', 'alphabet', 'gamma']);
      expect(await names({ where: { or: [{ qty: 0 }, { qty: 50 }] }, orderBy: byQty })).toEqual(['alpha', 'delta']);
      expect(
        await names({ where: { and: [{ qty: { gte: 10 } }, { not: { qty: { gte: 30 } } }] }, orderBy: byQty }),
      ).toEqual(['Alpha2', 'alphabet']);
      expect(await names({ where: { or: [] } })).toEqual([]);
      expect(await names({ where: { and: [] } })).toHaveLength(6);
      expect(await names({ where: { qty: { in: [] } } })).toEqual([]);
      expect(await names({ where: { qty: { notIn: [] } } })).toHaveLength(6);
    });

    it('combines combinators and field conditions of one object with AND', async () => {
      expect(await names({ where: { qty: { gte: 10 }, not: { qty: { gte: 30 } } } })).toEqual(['Alpha2', 'alphabet']);
      expect(await names({ where: { or: [{ qty: 0 }, { qty: 50 }], name: 'delta' } })).toEqual(['delta']);
      expect(await names({ where: { and: [{ qty: { gt: 0 } }], or: [{ name: 'beta' }, { name: 'alpha' }] } })).toEqual([
        'beta',
      ]);
    });

    it('matches prefixes case-sensitively, by characters (also beyond the BMP)', async () => {
      const { items } = await open();
      expect(await names({ where: { name: { startsWith: 'alpha' } }, orderBy: [{ field: 'name' }] })).toEqual([
        'alpha',
        'alphabet',
      ]);
      expect(await names({ where: { name: { startsWith: 'Alpha' } } })).toEqual(['Alpha2']);
      expect(await names({ where: { name: { startsWith: '%' } } })).toEqual([]);
      expect(await names({ where: { name: { startsWith: '_lpha' } } })).toEqual([]);
      await items.insertMany(['😀-one', '😀-two', '😁-x', '😀'].map((name) => ({ name, status: 'emoji' })));
      const emoji = async (prefix: string) =>
        (await items.find({ where: { status: 'emoji', name: { startsWith: prefix } } })).map(
          (row: { name: string }) => row.name,
        );
      expect(await emoji('😀')).toEqual(['😀-one', '😀-two', '😀']);
      expect(await emoji('😀-t')).toEqual(['😀-two']);
      expect(await emoji('😀-')).toEqual(['😀-one', '😀-two']);
    });

    it('follows SQL three-valued logic: rows without a value never match ne, notIn or not', async () => {
      expect(await names({ where: { due: { ne: '2026-03-01' } } })).toHaveLength(2);
      expect(await names({ where: { due: { notIn: ['2026-03-01'] } } })).toHaveLength(2);
      expect(await names({ where: { due: { notIn: [] } } })).toEqual(['alpha', 'alphabet', 'gamma']);
      expect(await names({ where: { not: { due: '2026-03-01' } } })).toHaveLength(2);
      expect(await names({ where: { due: { ne: null } } })).toHaveLength(3);
      expect(await names({ where: { due: { eq: null } } })).toHaveLength(3);
      expect(await names({ where: { due: null } })).toHaveLength(3);
      expect(await names({ where: { or: [{ due: '2026-03-01' }, { due: { isNull: true } }] } })).toHaveLength(4);
    });

    it('takes no null inside in/notIn lists or as a comparison operand (use isNull)', async () => {
      await invalid({ where: { due: { in: ['2026-03-01', null] } } });
      await invalid({ where: { due: { notIn: [null] } } });
      await invalid({ where: { score: { lt: null } } });
      await invalid({ where: { score: { gte: null } } });
      await invalid({ where: { score: { between: [null, 3] } } });
      await invalid({ where: { name: { startsWith: null } } });
    });

    it('checks filter values for their type only: a value outside the column matches what it equals', async () => {
      const { items } = await open();
      expect(await names({ where: { name: 'x'.repeat(300) } })).toEqual([]);
      expect(await names({ where: { name: { in: ['alpha', 'y'.repeat(300)] } } })).toEqual(['alpha']);
      expect(await names({ where: { name: { lt: 'alpha' + 'z'.repeat(300) } }, orderBy: [{ field: 'name' }] })).toEqual(
        ['Alpha2', 'alpha', 'alphabet'],
      );
      expect(await names({ where: { due: '2026-02-30' } })).toEqual([]);
      expect(await items.count({ ref: 'not-a-uuid' })).toBe(0);
      const ref = (await items.insert({ name: 'by-ref', ref: '3f2504e0-4f89-41d3-9a0c-0305e82c3302' })).ref;
      expect(await items.count({ ref: ref.toUpperCase() })).toBe(1);
      await invalid({ where: { qty: 1.5 } });
      await invalid({ where: { qty: '10' } });
      await invalid({ where: { due: '2026-3-1' } });
      await invalid({ where: { price: 1 } });
      await invalid({ where: { created: 'yesterday' } });
      await invalid({ where: { active: 1 } });
    });

    it('compares a decimal finer than the scale exactly', async () => {
      const { items } = await open();
      await items.insertMany(
        ['-1.01', '-1.00', '1.00', '1.01'].map((price) => ({ name: `fine${price}`, price, status: 'fine' })),
      );
      const prices = async (where: object) =>
        (await items.find({ where: { status: 'fine', price: where }, orderBy: [{ field: 'price' }] })).map(
          (row: { price: string }) => row.price,
        );
      expect(await prices({ eq: '1.005' })).toEqual([]);
      expect(await prices({ eq: '1.000' })).toEqual(['1.00']);
      expect(await prices({ ne: '1.005' })).toHaveLength(4);
      expect(await prices({ lt: '1.005' })).toEqual(['-1.01', '-1.00', '1.00']);
      expect(await prices({ lte: '1.005' })).toEqual(['-1.01', '-1.00', '1.00']);
      expect(await prices({ gt: '1.005' })).toEqual(['1.01']);
      expect(await prices({ gte: '1.005' })).toEqual(['1.01']);
      expect(await prices({ lt: '-1.005' })).toEqual(['-1.01']);
      expect(await prices({ gt: '-1.005' })).toEqual(['-1.00', '1.00', '1.01']);
      expect(await prices({ between: ['0.995', '1.005'] })).toEqual(['1.00']);
      expect(await prices({ between: ['1.005', '1.01'] })).toEqual(['1.01']);
      expect(await prices({ in: ['1.005', '1.01'] })).toEqual(['1.01']);
      expect(await prices({ notIn: ['1.005', '1.01'] })).toEqual(['-1.01', '-1.00', '1.00']);
      expect(await prices({ gt: '123456789012345.5' })).toEqual([]);
      expect(await prices({ lt: '-123456789012345.5' })).toEqual([]);
    });

    it('rejects undefined, null and empty filters instead of matching everything', async () => {
      const { items } = await open();
      await invalid({ where: { qty: undefined } });
      await invalid({ where: { qty: { gt: undefined } } });
      await invalid({ where: { qty: {} } });
      await invalid({ where: null });
      await invalid({ where: { and: [null] } });
      await invalid({ where: { or: [undefined] } });
      await invalid({ where: { not: null } });
      await invalid({ where: 'qty = 1' });
      await expect(items.count(null)).rejects.toBeInstanceOf(PluginStorageInvalid);
      await expect(items.update(null, { note: 'all' })).rejects.toBeInstanceOf(PluginStorageInvalid);
      await expect(items.delete(null)).rejects.toBeInstanceOf(PluginStorageInvalid);
      await expect(items.update({ qty: {} }, { note: 'all' })).rejects.toBeInstanceOf(PluginStorageInvalid);
      await expect(items.delete({ qty: {} })).rejects.toBeInstanceOf(PluginStorageInvalid);
      expect(await items.count({ status: 'q' })).toBe(6);
    });

    it('orders (nulls lowest), breaks ties by the primary key and paginates stably', async () => {
      expect(await names({ orderBy: [{ field: 'due' }, { field: 'name', direction: 'desc' }] })).toEqual([
        'delta',
        'beta',
        'Alpha2',
        'alpha',
        'alphabet',
        'gamma',
      ]);
      const descending = await names({ orderBy: [{ field: 'due', direction: 'desc' }, { field: 'name' }] });
      expect(descending.slice(-3)).toEqual(['Alpha2', 'beta', 'delta']);
      // Without an order, and on tied values, rows come by primary key ascending, also when sorting descending.
      expect(await names({})).toEqual(SEED);
      expect(await names({ orderBy: [{ field: 'status', direction: 'desc' }] })).toEqual(SEED);
      expect(await names({ orderBy: [{ field: 'score', direction: 'desc' }] })).toEqual([
        'delta',
        'gamma',
        'alphabet',
        'Alpha2',
        'alpha',
        'beta',
      ]);
      const all = await names({ orderBy: [{ field: 'qty' }] });
      expect(await names({ orderBy: [{ field: 'qty' }], limit: 2, offset: 1 })).toEqual(all.slice(1, 3));
      expect(await names({ orderBy: [{ field: 'qty' }], offset: 4 })).toEqual(all.slice(4));
      expect(await names({ limit: 0 })).toEqual([]);
      expect(await names({ orderBy: [{ field: 'qty', direction: 'desc' }, { field: 'qty' }] })).toEqual(
        [...SEED].reverse(),
      );
    });

    it('findOne, get by key, count and delete answer for their rows only', async () => {
      const { items, pairs } = await open();
      expect(await items.findOne({ where: { name: 'nothing-here' } })).toBeNull();
      expect(
        (await items.findOne({ where: { status: 'q' }, orderBy: [{ field: 'qty', direction: 'desc' }] })).name,
      ).toBe('delta');
      expect(await items.get(987654321)).toBeNull();
      expect(await items.count({ status: 'q', qty: { gte: 30 } })).toBe(3);
      const doomed = await items.insert({ name: 'doomed' });
      expect(await items.delete({ id: doomed.id })).toBe(1);
      expect(await items.delete({ id: doomed.id })).toBe(0);
      await pairs.insertMany([
        { a: 'x', b: 1, label: 'x1' },
        { a: 'x', b: 2, label: 'x2' },
      ]);
      expect(await pairs.get({ a: 'x', b: 2 })).toEqual({ a: 'x', b: 2, label: 'x2' });
      expect(await pairs.get({ a: 'x', b: 3 })).toBeNull();
      await expect(pairs.get({ a: 'x' })).rejects.toBeInstanceOf(PluginStorageInvalid);
    });

    it('refuses undeclared fields, unknown operators and operators a type does not have', async () => {
      await invalid({ where: { nope: 1 } });
      await invalid({ where: { toString: 1 } });
      await invalid({ where: { 'qty" = 1 OR "1': 1 } });
      await invalid({ where: { qty: { like: '%' } } });
      await invalid({ where: { meta: { eq: { a: 1 } } } });
      await invalid({ where: { meta: { in: [1] } } });
      await invalid({ where: { active: { gt: true } } });
      await invalid({ where: { active: { between: [false, true] } } });
      await invalid({ where: { qty: { startsWith: '1' } } });
      await invalid({ where: { qty: { between: [1] } } });
      await invalid({ where: { qty: { in: 'nope' } } });
      await invalid({ where: { qty: { isNull: 'yes' } } });
      await invalid({ orderBy: [{ field: 'meta' }] });
      await invalid({ orderBy: [{ field: 'active' }] });
      await invalid({ orderBy: [{ field: 'nope' }] });
      await invalid({ orderBy: [{ field: 'qty', direction: 'sideways' }] });
      await invalid({ orderBy: { field: 'qty' } });
      await invalid({ limit: -1 });
      await invalid({ limit: 1.5 });
      await invalid({ offset: -1 });
    });

    it('filters booleans by equality and membership', async () => {
      const { items } = await open();
      await items.insertMany([
        { name: 'on', active: true, status: 'bool' },
        { name: 'off', active: false, status: 'bool' },
      ]);
      expect(await items.count({ status: 'bool', active: false })).toBe(1);
      expect(await items.count({ status: 'bool', active: { ne: true } })).toBe(1);
      expect(await items.count({ status: 'bool', active: { in: [true, false] } })).toBe(2);
      expect(await items.count({ status: 'bool', active: { notIn: [true] } })).toBe(1);
    });
  });
}

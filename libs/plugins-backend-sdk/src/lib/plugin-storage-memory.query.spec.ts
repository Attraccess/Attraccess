import { createInMemoryPluginStorage } from './plugin-storage-memory';
import { PluginStorageInvalid } from './plugin-storage';
import { storage as definition } from './plugin-storage-memory.fixtures';

async function seeded() {
  const fake = createInMemoryPluginStorage(definition);
  const db = fake.storage.open(definition);
  await db.items.insertMany([
    { name: 'apple', sku: 'a1', qty: 5, price: '2.50', createdAt: new Date('2026-01-01T00:00:00Z') },
    { name: 'apricot', sku: 'a2', qty: 3, price: '10.00', createdAt: new Date('2026-01-02T00:00:00Z') },
    { name: 'banana', qty: 8, price: '1.05', active: false, createdAt: new Date('2026-01-03T00:00:00Z') },
    {
      name: 'cherry',
      sku: 'c1',
      qty: 3,
      createdAt: new Date('2026-01-04T00:00:00Z'),
      seenAt: new Date('2026-02-01T00:00:00Z'),
    },
    { name: 'Date', sku: 'd1', qty: 1, day: '2026-03-01', meta: { k: 1 } },
  ]);
  return db;
}

const names = (rows: { name: string }[]) => rows.map((row) => row.name);

describe('in-memory plugin storage: filters', () => {
  it('matches a plain value, null and several fields with AND', async () => {
    const db = await seeded();
    expect(names(await db.items.find({ where: { qty: 3 } }))).toEqual(['apricot', 'cherry']);
    expect(names(await db.items.find({ where: { sku: null } }))).toEqual(['banana']);
    expect(names(await db.items.find({ where: { qty: 3, name: 'cherry' } }))).toEqual(['cherry']);
    expect(await db.items.count()).toBe(5);
  });

  it('supports every comparison operator', async () => {
    const db = await seeded();
    const q = async (qty: object) => names(await db.items.find({ where: { qty }, orderBy: [{ field: 'name' }] }));
    expect(await q({ eq: 3 })).toEqual(['apricot', 'cherry']);
    expect(await q({ ne: 3 })).toEqual(['Date', 'apple', 'banana']);
    expect(await q({ lt: 3 })).toEqual(['Date']);
    expect(await q({ lte: 3 })).toEqual(['Date', 'apricot', 'cherry']);
    expect(await q({ gt: 5 })).toEqual(['banana']);
    expect(await q({ gte: 5 })).toEqual(['apple', 'banana']);
    expect(await q({ gt: 1, lt: 8 })).toEqual(['apple', 'apricot', 'cherry']);
    expect(await q({ between: [3, 5] })).toEqual(['apple', 'apricot', 'cherry']);
    expect(await q({ in: [1, 8] })).toEqual(['Date', 'banana']);
    expect(await q({ notIn: [1, 8] })).toEqual(['apple', 'apricot', 'cherry']);
    expect(await q({ in: [] })).toEqual([]);
    expect(await q({ notIn: [] })).toHaveLength(5);
  });

  it('supports isNull, startsWith (case sensitive) and eq/ne null', async () => {
    const db = await seeded();
    expect(names(await db.items.find({ where: { sku: { isNull: true } } }))).toEqual(['banana']);
    expect(await db.items.count({ sku: { isNull: false } })).toBe(4);
    expect(await db.items.count({ sku: { eq: null } })).toBe(1);
    expect(await db.items.count({ sku: { ne: null } })).toBe(4);
    expect(names(await db.items.find({ where: { name: { startsWith: 'ap' } } }))).toEqual(['apple', 'apricot']);
    expect(await db.items.count({ name: { startsWith: 'AP' } })).toBe(0);
  });

  it('compares decimals numerically, timestamps by instant, and dates as strings', async () => {
    const db = await seeded();
    expect(names(await db.items.find({ where: { price: { gt: '2.5' } } }))).toEqual(['apricot']);
    expect(names(await db.items.find({ where: { price: { lt: '2.50' }, active: false } }))).toEqual(['banana']);
    expect(await db.items.count({ price: { between: ['1', '3'] } })).toBe(2);
    expect(
      await db.items.count({
        createdAt: { gte: new Date('2026-01-03T00:00:00Z'), lt: new Date('2026-01-04T00:00:00Z') },
      }),
    ).toBe(1);
    expect(await db.items.count({ createdAt: new Date('2026-01-02T00:00:00Z') })).toBe(1);
    expect(await db.items.count({ day: { gte: '2026-03-01' } })).toBe(1);
    expect(await db.items.count({ seenAt: { gt: new Date('2026-01-01T00:00:00Z') } })).toBe(1);
  });

  it('combines filters with and / or / not', async () => {
    const db = await seeded();
    const where = { or: [{ name: 'apple' }, { and: [{ qty: { gte: 3 } }, { not: { name: { startsWith: 'a' } } }] }] };
    expect(names(await db.items.find({ where, orderBy: [{ field: 'name' }] }))).toEqual(['apple', 'banana', 'cherry']);
    expect(await db.items.count({ and: [] })).toBe(5);
    expect(await db.items.count({ or: [] })).toBe(0);
  });

  it('follows SQL three-valued logic: a NULL value never matches ne, notIn or not', async () => {
    const db = await seeded();
    expect(await db.items.count({ sku: { ne: 'a1' } })).toBe(3);
    expect(await db.items.count({ sku: { notIn: ['a1'] } })).toBe(3);
    expect(await db.items.count({ not: { sku: 'a1' } })).toBe(3);
    expect(await db.items.count({ or: [{ sku: 'a1' }, { sku: { isNull: true } }] })).toBe(2);
  });

  it('rejects a filter that would be ambiguous or unsupported instead of matching everything', async () => {
    const db = await seeded();
    const bad: unknown[] = [
      { nope: 1 },
      { qty: undefined },
      { qty: {} },
      { qty: { like: 1 } },
      { qty: { in: 3 } },
      { qty: { between: [1] } },
      { qty: { between: 5 } },
      { qty: { isNull: 'yes' } },
      { qty: { startsWith: 'a' } },
      { name: { startsWith: 5 } },
      { name: { in: [null] } },
      { qty: 'text' },
      { meta: { eq: { k: 1 } } },
      { meta: { gt: 1 } },
      { and: 3 },
      'name',
    ];
    for (const where of bad) {
      await expect(db.items.find({ where: where as never })).rejects.toBeInstanceOf(PluginStorageInvalid);
    }
    await expect(db.items.delete({ qty: undefined } as never)).rejects.toBeInstanceOf(PluginStorageInvalid);
    expect(await db.items.count()).toBe(5);
  });

  it('matches json only through isNull', async () => {
    const db = await seeded();
    expect(names(await db.items.find({ where: { meta: { isNull: false } } }))).toEqual(['Date']);
    expect(await db.items.count({ meta: null })).toBe(4);
  });
});

describe('in-memory plugin storage: order, limit, offset', () => {
  it('orders by several keys with direction, nulls first ascending and last descending', async () => {
    const db = await seeded();
    expect(names(await db.items.find({ orderBy: [{ field: 'qty', direction: 'desc' }, { field: 'name' }] }))).toEqual([
      'banana',
      'apple',
      'apricot',
      'cherry',
      'Date',
    ]);
    expect(names(await db.items.find({ orderBy: [{ field: 'sku' }, { field: 'name' }] }))[0]).toBe('banana');
    expect(names(await db.items.find({ orderBy: [{ field: 'sku', direction: 'desc' }] })).pop()).toBe('banana');
    expect(names(await db.items.find({ orderBy: [{ field: 'price', direction: 'desc' }] }))[0]).toBe('apricot');
    expect(names(await db.items.find({ orderBy: [{ field: 'createdAt', direction: 'desc' }] }))[0]).toBe('Date');
  });

  it('returns rows in insertion order without orderBy, and keeps ties in insertion order', async () => {
    const db = await seeded();
    expect(names(await db.items.find())[0]).toBe('apple');
    expect(names(await db.items.find({ orderBy: [{ field: 'qty' }] })).slice(1, 3)).toEqual(['apricot', 'cherry']);
  });

  it('applies limit and offset after ordering', async () => {
    const db = await seeded();
    const order = [{ field: 'name' as const }];
    expect(names(await db.items.find({ orderBy: order, limit: 2 }))).toEqual(['Date', 'apple']);
    expect(names(await db.items.find({ orderBy: order, limit: 2, offset: 2 }))).toEqual(['apricot', 'banana']);
    expect(names(await db.items.find({ orderBy: order, offset: 4 }))).toEqual(['cherry']);
    expect(await db.items.find({ limit: 0 })).toEqual([]);
    expect((await db.items.findOne({ orderBy: order, offset: 1 }))?.name).toBe('apple');
    expect(await db.items.findOne({ where: { name: 'zzz' } })).toBeNull();
  });

  it('rejects bad order, limit and offset', async () => {
    const db = await seeded();
    for (const query of [
      { orderBy: [{ field: 'nope' }] },
      { orderBy: [{ field: 'meta' }] },
      { orderBy: [{ field: 'name', direction: 'up' }] },
      { limit: -1 },
      { limit: 1.5 },
      { offset: -2 },
    ]) {
      await expect(db.items.find(query as never)).rejects.toBeInstanceOf(PluginStorageInvalid);
    }
  });
});

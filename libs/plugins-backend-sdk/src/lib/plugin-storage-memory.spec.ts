import { createInMemoryPluginStorage } from './plugin-storage-memory';
import {
  PluginStorageConflict,
  PluginStorageError,
  PluginStorageInvalid,
  PluginStorageNotFound,
  PluginStorageUniqueViolation,
  definePluginStorage,
  f,
  increment,
  table,
} from './plugin-storage';
import { storage as definition } from './plugin-storage-memory.fixtures';

function setup(options = {}) {
  const fake = createInMemoryPluginStorage(definition, options);
  return { fake, db: fake.storage.open(definition) };
}

describe('createInMemoryPluginStorage: insert and defaults', () => {
  it('fills generated keys and defaults and returns copies', async () => {
    const now = new Date('2026-01-02T03:04:05.678Z');
    const { db } = setup({ now: () => now });
    const first = await db.items.insert({ name: 'a' });
    const second = await db.items.insert({ name: 'b' });
    expect(first).toEqual({
      id: 1,
      name: 'a',
      sku: null,
      qty: 0,
      price: null,
      active: true,
      day: null,
      meta: null,
      createdAt: now,
      seenAt: null,
    });
    expect(second.id).toBe(2);
    first.createdAt.setFullYear(1999);
    expect((await db.items.get(1))?.createdAt).toEqual(now);
  });

  it('generates lowercase uuids, and honours explicit keys by moving the counter past them', async () => {
    const { db } = setup({ generateUuid: () => '00000000-0000-4000-8000-000000000001' });
    expect((await db.children.insert({ label: 'x' })).id).toBe('00000000-0000-4000-8000-000000000001');
    await db.items.insert({ id: 10, name: 'a' });
    expect((await db.items.insert({ name: 'b' })).id).toBe(11);
  });

  it('never reuses a generated key after a delete', async () => {
    const { db } = setup();
    await db.items.insert({ name: 'a' });
    await db.items.delete({ id: 1 });
    expect((await db.items.insert({ name: 'b' })).id).toBe(2);
  });

  it('normalizes decimals to the declared scale and rejects rounding or overflow', async () => {
    const { db } = setup();
    expect((await db.items.insert({ name: 'a', price: '12.5' })).price).toBe('12.50');
    expect((await db.items.insert({ name: 'b', price: '-0.00' })).price).toBe('0.00');
    await expect(db.items.insert({ name: 'c', price: '1.005' })).rejects.toBeInstanceOf(PluginStorageInvalid);
    await expect(db.items.insert({ name: 'd', price: '1000000.00' })).rejects.toBeInstanceOf(PluginStorageInvalid);
    await expect(db.items.insert({ name: 'e', price: 12.5 as never })).rejects.toBeInstanceOf(PluginStorageInvalid);
  });

  it.each([
    ['a missing required field', {}],
    ['an unknown field', { name: 'a', nope: 1 }],
    ['a string that is too long', { name: 'x'.repeat(256) }],
    ['a null in a required field', { name: null }],
    ['a non-integer', { name: 'a', qty: 1.5 }],
    ['an unsafe integer', { name: 'a', qty: 2 ** 60 }],
    ['a boolean that is not a boolean', { name: 'a', active: 'yes' }],
    ['an invalid date', { name: 'a', createdAt: new Date('nope') }],
    ['a timestamp that is not a Date', { name: 'a', createdAt: '2026-01-01' }],
    ['an impossible day', { name: 'a', day: '2026-02-30' }],
    ['a malformed day', { name: 'a', day: '2026-2-3' }],
    ['a non-JSON value', { name: 'a', meta: () => 1 }],
  ])('rejects %s with PluginStorageInvalid', async (_label, row) => {
    const { db } = setup();
    await expect(db.items.insert(row as never)).rejects.toBeInstanceOf(PluginStorageInvalid);
  });

  it('rejects an uppercase uuid and a non-object row', async () => {
    const { db } = setup();
    await expect(db.children.insert({ id: '00000000-0000-4000-8000-00000000000A', label: 'x' })).rejects.toBeInstanceOf(
      PluginStorageInvalid,
    );
    await expect(db.items.insert('x' as never)).rejects.toBeInstanceOf(PluginStorageInvalid);
  });

  it('stores JSON by value, so later mutation of the input does not change the row', async () => {
    const { db } = setup();
    const meta = { nested: { n: 1 } };
    await db.items.insert({ name: 'a', meta });
    meta.nested.n = 2;
    const row = await db.items.get(1);
    expect(row?.meta).toEqual({ nested: { n: 1 } });
    (row?.meta as { nested: { n: number } }).nested.n = 3;
    expect((await db.items.get(1))?.meta).toEqual({ nested: { n: 1 } });
  });

  it('insertMany is all or nothing', async () => {
    const { db } = setup();
    await expect(
      db.items.insertMany([
        { name: 'a', sku: 's1' },
        { name: 'b', sku: 's1' },
      ]),
    ).rejects.toBeInstanceOf(PluginStorageUniqueViolation);
    expect(await db.items.count()).toBe(0);
    expect((await db.items.insertMany([{ name: 'a' }, { name: 'b' }])).map((row) => row.id)).toEqual([1, 2]);
  });
});

describe('createInMemoryPluginStorage: keys and uniqueness', () => {
  it('enforces unique indexes, treats NULL as distinct, and reports the neutral error', async () => {
    const { db } = setup();
    await db.items.insert({ name: 'a', sku: 's1' });
    await expect(db.items.insert({ name: 'b', sku: 's1' })).rejects.toMatchObject({
      name: 'PluginStorageUniqueViolation',
      code: 'UNIQUE_VIOLATION',
    });
    await db.items.insert({ name: 'c' });
    await db.items.insert({ name: 'd' });
    expect(await db.items.count({ sku: null })).toBe(2);
  });

  it('enforces composite primary keys and looks them up with an object', async () => {
    const { db } = setup();
    await db.links.insert({ a: 1, b: 2, note: 'x' });
    await expect(db.links.insert({ a: 1, b: 2 })).rejects.toBeInstanceOf(PluginStorageUniqueViolation);
    await db.links.insert({ a: 1, b: 3 });
    expect((await db.links.get({ a: 1, b: 2 }))?.note).toBe('x');
    expect(await db.links.get({ a: 9, b: 9 })).toBeNull();
    await expect(db.links.get(1)).rejects.toBeInstanceOf(PluginStorageInvalid);
    await expect(db.links.get({ a: 1 })).rejects.toBeInstanceOf(PluginStorageInvalid);
  });

  it('get takes a plain key or an object for a one-field key', async () => {
    const { db } = setup();
    await db.items.insert({ name: 'a' });
    expect((await db.items.get(1))?.name).toBe('a');
    expect((await db.items.get({ id: 1 }))?.name).toBe('a');
    expect(await db.items.get(5)).toBeNull();
    await expect(db.items.get({ name: 'a' })).rejects.toBeInstanceOf(PluginStorageInvalid);
  });
});

describe('createInMemoryPluginStorage: update', () => {
  it('is an atomic compare-and-set that returns the number of affected rows', async () => {
    const { db } = setup();
    await db.items.insert({ name: 'a', sku: 'pending' });
    expect(await db.items.update({ id: 1, sku: 'pending' }, { sku: 'done' })).toBe(1);
    expect(await db.items.update({ id: 1, sku: 'pending' }, { sku: 'other' })).toBe(0);
    expect((await db.items.get(1))?.sku).toBe('done');
  });

  it('applies increments, null patches and ignores undefined entries', async () => {
    const { db } = setup();
    await db.items.insert({ name: 'a', qty: 5, sku: 'x' });
    await db.items.update({ id: 1 }, { qty: increment(3), sku: null, name: undefined });
    expect(await db.items.get(1)).toMatchObject({ qty: 8, sku: null, name: 'a' });
    await db.items.update({ id: 1 }, { qty: increment(-10) });
    expect((await db.items.get(1))?.qty).toBe(-2);
  });

  it('refuses bad patches without changing anything', async () => {
    const { db } = setup();
    await db.items.insert({ name: 'a', sku: 'x' });
    await db.items.insert({ name: 'b', sku: 'y' });
    await expect(db.items.update({}, { sku: 'z' })).rejects.toBeInstanceOf(PluginStorageUniqueViolation);
    expect((await db.items.find({ orderBy: [{ field: 'id' }] })).map((row) => row.sku)).toEqual(['x', 'y']);
    for (const patch of [
      {},
      { id: 4 },
      { name: null },
      { nope: 1 },
      { name: increment(1) },
      { qty: increment(2 ** 53) },
    ]) {
      await expect(db.items.update({ id: 1 }, patch as never)).rejects.toBeInstanceOf(PluginStorageInvalid);
    }
    await expect(db.items.update({ id: 1 }, null as never)).rejects.toBeInstanceOf(PluginStorageInvalid);
  });

  it('counts matched rows and leaves non-matching rows alone', async () => {
    const { db } = setup();
    await db.items.insertMany([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    expect(await db.items.update({ name: { in: ['a', 'c'] } }, { qty: 9 })).toBe(2);
    expect((await db.items.find({ where: { qty: 9 } })).map((row) => row.name)).toEqual(['a', 'c']);
    expect(await db.items.update({ name: 'zzz' }, { qty: 1 })).toBe(0);
  });
});

describe('createInMemoryPluginStorage: delete', () => {
  it('returns the number of removed rows', async () => {
    const { db } = setup();
    await db.items.insertMany([{ name: 'a' }, { name: 'b' }]);
    expect(await db.items.delete({ name: 'a' })).toBe(1);
    expect(await db.items.delete({})).toBe(1);
    expect(await db.items.count()).toBe(0);
  });
});

describe('createInMemoryPluginStorage: upsert', () => {
  it('inserts, then overwrites every non-key field by default', async () => {
    const { db } = setup();
    const created = await db.items.upsert({ name: 'a', sku: 's', qty: 1 }, { conflictOn: ['sku'] });
    const updated = await db.items.upsert({ name: 'b', sku: 's', qty: 2 }, { conflictOn: ['sku'] });
    expect(updated).toMatchObject({ id: created.id, name: 'b', qty: 2 });
    expect(await db.items.count()).toBe(1);
  });

  it('limits the overwrite to the listed fields and may conflict on the primary key', async () => {
    const { db } = setup();
    await db.items.insert({ name: 'a', sku: 's', qty: 1 });
    await db.items.upsert({ name: 'b', sku: 's', qty: 7 }, { conflictOn: ['sku'], update: ['qty'] });
    expect(await db.items.get(1)).toMatchObject({ name: 'a', qty: 7 });
    await db.items.upsert({ id: 1, name: 'c' }, { conflictOn: ['id'], update: ['name'] });
    expect((await db.items.get(1))?.name).toBe('c');
  });

  it('inserts when the conflict key is NULL, and refuses unknown keys and key overwrites', async () => {
    const { db } = setup();
    await db.items.upsert({ name: 'a' }, { conflictOn: ['sku'] });
    await db.items.upsert({ name: 'b' }, { conflictOn: ['sku'] });
    expect(await db.items.count()).toBe(2);
    await expect(db.items.upsert({ name: 'a' }, { conflictOn: ['name'] })).rejects.toBeInstanceOf(PluginStorageInvalid);
    await expect(
      db.items.upsert({ name: 'a', sku: 'k' }, { conflictOn: ['sku'], update: ['sku'] }),
    ).rejects.toBeInstanceOf(PluginStorageInvalid);
    await expect(
      db.items.upsert({ name: 'a', sku: 'k' }, { conflictOn: ['sku'], update: ['nope' as never] }),
    ).rejects.toBeInstanceOf(PluginStorageInvalid);
  });

  it('reports a clash with another unique key as a unique violation and keeps the data', async () => {
    const { db } = setup();
    await db.parents.insert({ name: 'p1' });
    await db.parents.insert({ name: 'p2' });
    await expect(db.parents.upsert({ id: 2, name: 'p1' }, { conflictOn: ['id'] })).rejects.toBeInstanceOf(
      PluginStorageUniqueViolation,
    );
    expect((await db.parents.get(2))?.name).toBe('p2');
  });
});

describe('createInMemoryPluginStorage: aggregate', () => {
  it('returns min, max, exact sum and count of the matching rows', async () => {
    const { db } = setup();
    await db.items.insertMany([
      { name: 'a', qty: 2, price: '0.10', day: '2026-01-05' },
      { name: 'b', qty: 5, price: '0.20', day: '2026-01-01' },
      { name: 'c', qty: 9 },
    ]);
    expect(await db.items.aggregate('qty')).toEqual({ min: 2, max: 9, sum: 16, count: 3 });
    expect(await db.items.aggregate('qty', { qty: { lt: 9 } })).toEqual({ min: 2, max: 5, sum: 7, count: 2 });
    expect(await db.items.aggregate('price')).toEqual({ min: '0.10', max: '0.20', sum: '0.30', count: 3 });
    expect(await db.items.aggregate('day')).toEqual({ min: '2026-01-01', max: '2026-01-05', sum: null, count: 3 });
    expect(await db.items.aggregate('qty', { name: 'zzz' })).toEqual({ min: null, max: null, sum: null, count: 0 });
  });

  it('aggregates timestamps and refuses other field types', async () => {
    const { db } = setup();
    const early = new Date('2026-01-01T00:00:00Z');
    const late = new Date('2026-06-01T00:00:00Z');
    await db.items.insertMany([
      { name: 'a', seenAt: late },
      { name: 'b', seenAt: early },
    ]);
    expect(await db.items.aggregate('seenAt')).toEqual({ min: early, max: late, sum: null, count: 2 });
    await expect(db.items.aggregate('name')).rejects.toBeInstanceOf(PluginStorageInvalid);
    await expect(db.items.aggregate('nope' as never)).rejects.toBeInstanceOf(PluginStorageInvalid);
  });
});

describe('createInMemoryPluginStorage: lifecycle helpers', () => {
  it('exposes committed rows, resets data and generated keys', async () => {
    const { fake, db } = setup();
    await db.items.insert({ name: 'a' });
    expect(fake.rows('items')).toHaveLength(1);
    expect(() => fake.rows('nope')).toThrow(PluginStorageInvalid);
    fake.reset();
    expect(fake.rows('items')).toEqual([]);
    expect((await db.items.insert({ name: 'b' })).id).toBe(1);
  });

  it('opens only the registered definition, and validates a definition on creation', () => {
    const { fake } = setup();
    const other = definePluginStorage({ tables: { x: table({ id: f.id() }) }, migrations: [] });
    expect(() => fake.storage.open(other)).toThrow(PluginStorageInvalid);
    expect(() => fake.storage.open(definition)).not.toThrow();
    expect(PluginStorageNotFound.prototype).toBeInstanceOf(PluginStorageError);
    expect(PluginStorageConflict.prototype).toBeInstanceOf(PluginStorageError);
  });
});

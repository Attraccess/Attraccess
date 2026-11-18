import { f, PluginStorageInvalid, table } from '@attraccess/plugins-backend-sdk';
import { sqliteStorageDialect } from '../../database/sqlite/plugin-storage/sqlite-storage-dialect';
import { compileTable, type StorageNaming } from './storage-compile';
import { compileQuery, compileWhere, fieldOf, StorageParams } from './storage-query';

const naming: StorageNaming = { pluginName: 'demo', namespace: 'demo', reservedTables: new Set() };
const items = compileTable(
  naming,
  'items',
  table({
    id: f.id(),
    name: f.string({ length: 20 }),
    note: f.text({ column: 'memo' }).optional(),
    qty: f.integer().withDefault(0),
    price: f.decimal(8, 2).withDefault('0.00'),
    active: f.boolean().withDefault(true),
    created: f.timestamp().withDefault({ now: true }),
    due: f.date().optional(),
    meta: f.json().optional(),
  }),
  'plugin_demo_items',
  () => undefined,
);
const composite = compileTable(
  naming,
  'pairs',
  table({ a: f.string(), b: f.integer() }, { primaryKey: ['a', 'b'] }),
  'plugin_demo_pairs',
  () => undefined,
);

const where = (filter: unknown) => {
  const params = new StorageParams(sqliteStorageDialect);
  return { sql: compileWhere(items, sqliteStorageDialect, params, filter), params: params.values };
};
const rejects = (filter: unknown, message: RegExp) => {
  expect(() => where(filter)).toThrow(PluginStorageInvalid);
  expect(() => where(filter)).toThrow(message);
};

describe('compileWhere', () => {
  it('matches everything without a filter or with an empty one', () => {
    expect(where(undefined)).toEqual({ sql: '1 = 1', params: [] });
    expect(where(null).sql).toBe('1 = 1');
    expect(where({}).sql).toBe('1 = 1');
  });

  it('compares a field to a value or null directly', () => {
    expect(where({ name: 'a' })).toEqual({ sql: '"name" = ?', params: ['a'] });
    expect(where({ note: null }).sql).toBe('"memo" IS NULL');
    expect(where({ name: { eq: null } }).sql).toBe('"name" IS NULL');
  });

  it('joins several fields with AND and binds the encoded values in order', () => {
    const { sql, params } = where({ name: 'a', qty: 3, active: false, price: '1.5' });
    expect(sql).toBe('("name" = ? AND "qty" = ? AND "active" = ? AND "price" = ?)');
    expect(params).toEqual(['a', 3, 0, 150]);
  });

  it('encodes timestamps and dates', () => {
    expect(where({ created: new Date('2026-01-02T03:04:05.006Z') }).params).toEqual(['2026-01-02 03:04:05.006']);
    expect(where({ due: '2026-02-03' }).params).toEqual(['2026-02-03']);
  });

  describe('operators', () => {
    it.each([
      ['eq', { eq: 'a' }, '"name" = ?'],
      ['ne', { ne: 'a' }, '"name" <> ?'],
      ['lt', { lt: 'a' }, '"name" < ?'],
      ['lte', { lte: 'a' }, '"name" <= ?'],
      ['gt', { gt: 'a' }, '"name" > ?'],
      ['gte', { gte: 'a' }, '"name" >= ?'],
    ])('%s', (_name, condition, sql) => {
      expect(where({ name: condition })).toEqual({ sql, params: ['a'] });
    });

    it('ne null finds rows with a value', () => {
      expect(where({ name: { ne: null } }).sql).toBe('"name" IS NOT NULL');
    });

    it('between binds both bounds', () => {
      expect(where({ qty: { between: [1, 5] } })).toEqual({ sql: '"qty" BETWEEN ? AND ?', params: [1, 5] });
      rejects({ qty: { between: [1] } }, /"between" takes \[low, high\]/);
      rejects({ qty: { between: 1 } }, /"between" takes \[low, high\]/);
    });

    it('isNull is true unless given false', () => {
      expect(where({ note: { isNull: true } }).sql).toBe('"memo" IS NULL');
      expect(where({ note: { isNull: false } }).sql).toBe('"memo" IS NOT NULL');
    });

    it('startsWith binds the prefix and asks the dialect', () => {
      expect(where({ name: { startsWith: 'ab' } })).toEqual({ sql: 'substr("name", 1, 2) = ?', params: ['ab'] });
      expect(where({ note: { startsWith: 'x' } }).sql).toBe('substr("memo", 1, 1) = ?');
      rejects({ name: { startsWith: 3 } }, /"startsWith" takes a string/);
      rejects({ qty: { startsWith: 'a' } }, /applies to string and text fields/);
    });

    it('combines several operators of one field with AND', () => {
      expect(where({ qty: { gt: 1, lt: 9 } })).toEqual({ sql: '("qty" > ? AND "qty" < ?)', params: [1, 9] });
    });

    it('treats an empty condition object as always true', () => {
      expect(where({ qty: {} }).sql).toBe('1 = 1');
    });

    it('refuses ordering operators on json and boolean fields', () => {
      rejects({ active: { gt: true } }, /Operator "gt" is not supported on boolean field "active"/);
      rejects({ active: { between: [false, true] } }, /Operator "between" is not supported on boolean/);
    });

    it('allows only isNull and eq on json fields', () => {
      expect(where({ meta: { isNull: true } }).sql).toBe('"meta" IS NULL');
      expect(where({ meta: { eq: null } }).sql).toBe('"meta" IS NULL');
      rejects({ meta: { eq: { a: 1 } } }, /JSON field "meta" can only be filtered with isNull/);
      rejects({ meta: { ne: null } }, /JSON field "meta" can only be filtered with isNull/);
      rejects({ meta: { a: 1 } }, /Unknown filter operator "a" on field "meta"/);
    });

    it('rejects unknown operators and undefined values', () => {
      rejects({ qty: { like: 1 } }, /Unknown filter operator "like" on field "qty"/);
      rejects({ qty: { gt: undefined } }, /The operator "gt" on "qty" has an undefined value/);
      rejects({ qty: undefined }, /The filter value of "qty" is undefined/);
    });

    it('treats a Date or an array condition as a value, not an operator object', () => {
      expect(where({ created: new Date(0) }).sql).toBe('"created" = ?');
      rejects({ qty: [1, 2] }, /expected a safe integer/);
    });
  });

  describe('in and notIn', () => {
    it('lists the bound values', () => {
      expect(where({ qty: { in: [1, 2, 3] } })).toEqual({ sql: '"qty" IN (?, ?, ?)', params: [1, 2, 3] });
      expect(where({ qty: { notIn: [1, 2] } })).toEqual({ sql: '"qty" NOT IN (?, ?)', params: [1, 2] });
    });

    it('matches nothing for an empty in list and everything with a value for an empty notIn list', () => {
      expect(where({ qty: { in: [] } }).sql).toBe('0 = 1');
      expect(where({ qty: { notIn: [] } }).sql).toBe('"qty" IS NOT NULL');
    });

    it('lets null in an in list match rows without a value', () => {
      expect(where({ qty: { in: [1, null] } }).sql).toBe('("qty" IN (?) OR "qty" IS NULL)');
      expect(where({ qty: { in: [null] } }).sql).toBe('(0 = 1 OR "qty" IS NULL)');
    });

    it('never matches notIn with a null in the list', () => {
      expect(where({ qty: { notIn: [1, null] } }).sql).toBe('0 = 1');
    });

    it('takes lists only, of bounded size, with valid values', () => {
      rejects({ qty: { in: 1 } }, /"in" on "qty" takes a list/);
      rejects({ qty: { notIn: 'x' } }, /"notIn" on "qty" takes a list/);
      rejects({ qty: { in: new Array(20_001).fill(1) } }, /"in" takes at most 20000 values/);
      expect(where({ qty: { in: new Array(20_000).fill(1) } }).params).toHaveLength(20_000);
      rejects({ qty: { in: ['x'] } }, /expected a safe integer/);
    });
  });

  describe('and, or and not', () => {
    it('groups filters in parentheses', () => {
      expect(where({ and: [{ qty: 1 }, { name: 'a' }] }).sql).toBe('("qty" = ? AND "name" = ?)');
      expect(where({ or: [{ qty: 1 }, { name: 'a' }] }).sql).toBe('("qty" = ? OR "name" = ?)');
      expect(where({ or: [{ qty: 1 }] }).sql).toBe('("qty" = ?)');
    });

    it('treats an empty and as true and an empty or as false', () => {
      expect(where({ and: [] }).sql).toBe('1 = 1');
      expect(where({ or: [] }).sql).toBe('0 = 1');
    });

    it('negates a nested filter', () => {
      expect(where({ not: { qty: 1 } }).sql).toBe('(NOT "qty" = ?)');
    });

    it('nests, and combines with field conditions', () => {
      const { sql, params } = where({ name: 'a', or: [{ qty: 1 }, { and: [{ qty: 2 }, { not: { active: true } }] }] });
      expect(sql).toBe('("name" = ? AND ("qty" = ? OR ("qty" = ? AND (NOT "active" = ?))))');
      expect(params).toEqual(['a', 1, 2, 1]);
    });

    it('rejects a combinator without a list', () => {
      rejects({ and: { qty: 1 } }, /"and" takes a list of filters/);
      rejects({ or: 'x' }, /"or" takes a list of filters/);
    });

    it('rejects filters nested too deeply', () => {
      const nest = (depth: number): unknown => (depth === 0 ? { qty: 1 } : { not: nest(depth - 1) });
      expect(() => where(nest(16))).not.toThrow();
      rejects(nest(17), /The filter is nested too deeply/);
    });
  });

  it('rejects filters that are no objects and unknown fields', () => {
    rejects('qty = 1', /A filter is an object of field conditions/);
    rejects([{ qty: 1 }], /A filter is an object of field conditions/);
    rejects(new Date(), /A filter is an object of field conditions/);
    rejects({ ghost: 1 }, /Unknown field "ghost" in a filter of table "items"/);
    rejects({ and: [{ ghost: 1 }] }, /Unknown field "ghost"/);
  });

  it('validates values against the field type', () => {
    rejects({ name: 5 }, /Invalid value for name \(string\): expected a string/);
    rejects({ name: 'x'.repeat(21) }, /longer than 20 characters/);
    rejects({ price: '1.234' }, /at most 2 fraction digits/);
  });

  it('binds only the non-null entries of an in list on a required field', () => {
    expect(where({ name: { in: ['a', null] } }).params).toEqual(['a']);
  });
});

describe('compileQuery', () => {
  const query = (input?: unknown, table = items) =>
    compileQuery(table, sqliteStorageDialect, new StorageParams(sqliteStorageDialect), input as never);

  it('orders by the primary key and has no limit by default', () => {
    expect(query()).toEqual({ where: '1 = 1', orderBy: 'ORDER BY "id" ASC NULLS FIRST', limit: '' });
  });

  it('orders by the given fields, then breaks ties by the key', () => {
    expect(query({ orderBy: [{ field: 'name' }, { field: 'qty', direction: 'desc' }] }).orderBy).toBe(
      'ORDER BY "name" ASC NULLS FIRST, "qty" DESC NULLS LAST, "id" ASC NULLS FIRST',
    );
  });

  it('skips a field that is already ordered and a key field that is already in the order', () => {
    expect(query({ orderBy: [{ field: 'id', direction: 'desc' }, { field: 'id' }] }).orderBy).toBe(
      'ORDER BY "id" DESC NULLS LAST',
    );
  });

  it('adds every missing key field of a composite key', () => {
    expect(query({ orderBy: [{ field: 'b' }] }, composite).orderBy).toBe(
      'ORDER BY "b" ASC NULLS FIRST, "a" ASC NULLS FIRST',
    );
  });

  it('uses the physical column of a field', () => {
    expect(query({ orderBy: [{ field: 'note' }] }).orderBy).toContain('"memo" ASC');
  });

  it('rejects malformed orders', () => {
    expect(() => query({ orderBy: 'name' })).toThrow(/orderBy is a list of \{ field, direction \}/);
    expect(() => query({ orderBy: null })).toThrow(/orderBy is a list/);
    expect(() => query({ orderBy: [{ field: 'ghost' }] })).toThrow(/Unknown field "ghost" in orderBy of table "items"/);
    expect(() => query({ orderBy: [null] })).toThrow(/Unknown field "undefined" in orderBy/);
    expect(() => query({ orderBy: [{ field: 'meta' }] })).toThrow(/Operator "orderBy" is not supported on json field/);
    expect(() => query({ orderBy: [{ field: 'active' }] })).toThrow(/not supported on boolean field "active"/);
    expect(() => query({ orderBy: [{ field: 'name', direction: 'up' }] })).toThrow(/direction is "asc" or "desc"/);
  });

  it('builds limit and offset', () => {
    expect(query({ limit: 10 }).limit).toBe('LIMIT 10');
    expect(query({ limit: 10, offset: 5 }).limit).toBe('LIMIT 10 OFFSET 5');
    expect(query({ offset: 5 }).limit).toBe('LIMIT -1 OFFSET 5');
    expect(query({ limit: 0 }).limit).toBe('LIMIT 0');
  });

  it.each([
    ['limit', -1],
    ['limit', 1.5],
    ['limit', '5'],
    ['offset', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects %s = %p', (name, value) => {
    expect(() => query({ [name]: value })).toThrow(`${name} must be a non-negative integer.`);
  });

  it('rejects a query that is no object', () => {
    expect(() => query(null)).toThrow(/A query is an object/);
    expect(() => query('all')).toThrow(/A query is an object/);
  });

  it('compiles the filter into the same parameter list', () => {
    const params = new StorageParams(sqliteStorageDialect);
    const parts = compileQuery(items, sqliteStorageDialect, params, { where: { qty: { gt: 2 } }, limit: 1 });
    expect(parts.where).toBe('"qty" > ?');
    expect(params.values).toEqual([2]);
  });
});

describe('fieldOf', () => {
  it('finds declared fields only', () => {
    expect(fieldOf(items, 'note', 'a filter').column).toBe('memo');
    expect(() => fieldOf(items, 'memo', 'a filter')).toThrow(/Unknown field "memo"/);
    expect(() => fieldOf(items, 7, 'a row')).toThrow(/Unknown field "7" in a row of table "items"/);
  });
});

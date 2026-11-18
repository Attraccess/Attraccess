import { DataSource, type QueryRunner } from 'typeorm';
import { f, PluginStorageInvalid, step, table } from '@attraccess/plugins-backend-sdk';
import { ManagerExecutor } from '../../database/sqlite/plugin-storage/sqlite-storage-sessions';
import { sqliteStorageDdl } from '../../database/sqlite/plugin-storage/sqlite-storage-ddl';
import { sqliteStorageDialect } from '../../database/sqlite/plugin-storage/sqlite-storage-dialect';
import type { PluginStorageSessions } from './storage-dialect.port';
import { createRecordPort } from './storage-records';
import { compilePluginStorage } from './storage-schema';

/** The record port on an in-memory SQLite database: statements are real, nothing is mocked. */
const definitions = {
  items: table(
    {
      id: f.id(),
      name: f.string({ length: 20 }),
      qty: f.integer().withDefault(0),
      price: f.decimal(10, 2).withDefault('0.00'),
      active: f.boolean().withDefault(true),
      created: f.timestamp().withDefault({ now: true }),
      due: f.date().optional(),
      meta: f.json().optional(),
      note: f.string().optional(),
      moment: f.timestamp().optional(),
    },
    { indexes: [{ name: 'IDX_demo_items_name', fields: ['name'], unique: true }] },
  ),
  pairs: table({ a: f.string(), b: f.integer(), v: f.string().optional() }, { primaryKey: ['a', 'b'] }),
  tags: table({ id: f.uuidId(), label: f.string() }),
  flags: table({ name: f.string(), on: f.boolean().withDefault(false) }, { primaryKey: ['name'] }),
  bare: table({ id: f.id() }),
};

let source: DataSource;
let runner: QueryRunner;
let port: ReturnType<typeof createRecordPort>;
// The port is typed from the declaration; the tests drive it with deliberately wrong input, so it is untyped here.
type Api = Record<string, (...args: unknown[]) => Promise<unknown>>;
const api = (name: string): Api => (port as unknown as Record<string, Api>)[name];

beforeAll(async () => {
  source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  runner = source.createQueryRunner();
  const compiled = compilePluginStorage(
    'demo',
    {
      tables: definitions,
      migrations: [
        {
          version: 1,
          name: 'baseline',
          steps: Object.entries(definitions).map(([name, definition]) => step.createTable(name, definition)),
        },
      ],
    },
    { reservedTables: new Set() },
  );
  for (const migration of compiled.migrations) {
    for (const resolved of migration.steps) {
      for (const statement of sqliteStorageDdl.statements(resolved)) await runner.query(statement);
    }
  }
  const executor = new ManagerExecutor(runner.manager);
  const sessions: PluginStorageSessions = { run: (_access, _scope, work) => work(executor) };
  port = createRecordPort(compiled.tables, sqliteStorageDialect, sessions);
});

afterAll(async () => {
  await runner.release();
  await source.destroy();
});

beforeEach(async () => {
  for (const name of Object.keys(definitions)) await runner.query(`DELETE FROM "plugin_demo_${name}"`);
  await runner.query('DELETE FROM sqlite_sequence');
});

const rejects = (promise: Promise<unknown>, message: RegExp) =>
  expect(promise).rejects.toThrow(expect.objectContaining({ message: expect.stringMatching(message) }));

describe('createRecordPort', () => {
  it('serves one frozen API per table', () => {
    expect(Object.keys(port).sort()).toEqual(['bare', 'flags', 'items', 'pairs', 'tags']);
    expect(Object.isFrozen(port)).toBe(true);
    expect(Object.isFrozen(api('items'))).toBe(true);
  });

  describe('insert', () => {
    it('fills defaults, the generated key and nullable fields', async () => {
      const row = (await api('items').insert({ name: 'a' })) as Record<string, unknown>;
      expect(row).toMatchObject({
        id: 1,
        name: 'a',
        qty: 0,
        price: '0.00',
        active: true,
        due: null,
        meta: null,
        note: null,
      });
      expect(row.created).toBeInstanceOf(Date);
      expect(await api('items').get(1)).toEqual(row);
    });

    it('stores every field type and reads it back', async () => {
      const moment = new Date('2026-03-04T05:06:07.089Z');
      await api('items').insert({
        name: 'full',
        qty: 5,
        price: '12.5',
        active: false,
        due: '2026-03-04',
        meta: { a: [1, 'x', null] },
        moment,
      });
      expect(await api('items').findOne({ where: { name: 'full' } })).toMatchObject({
        qty: 5,
        price: '12.50',
        active: false,
        due: '2026-03-04',
        meta: { a: [1, 'x', null] },
        moment,
      });
    });

    it('generates a lowercase uuid key', async () => {
      const row = (await api('tags').insert({ label: 'x' })) as { id: string };
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(await api('tags').get(row.id)).toEqual(row);
    });

    it('inserts a row of a table with nothing but a generated key', async () => {
      expect(await api('bare').insert({})).toEqual({ id: 1 });
    });

    it('rejects what the table cannot hold', async () => {
      await rejects(api('items').insert('x'), /A row of "items" is an object/);
      await rejects(api('items').insert([]), /A row of "items" is an object/);
      await rejects(api('items').insert({}), /Missing required field "items.name"/);
      await rejects(api('items').insert({ name: 'a', ghost: 1 }), /Unknown field "ghost" in a row of table "items"/);
      await rejects(api('items').insert({ name: 5 }), /Invalid value for items.name \(string\)/);
      await rejects(api('items').insert({ name: null }), /the field is required/);
    });

    it('maps a unique violation to a neutral error without leaking the statement', async () => {
      await api('items').insert({ name: 'dup' });
      await expect(api('items').insert({ name: 'dup' })).rejects.toMatchObject({
        name: 'PluginStorageUniqueViolation',
      });
    });
  });

  describe('insertMany', () => {
    it('inserts rows in order and returns them', async () => {
      const rows = (await api('items').insertMany([{ name: 'a' }, { name: 'b' }])) as { id: number }[];
      expect(rows.map((row) => row.id)).toEqual([1, 2]);
      expect(await api('items').insertMany([])).toEqual([]);
    });

    it('takes a list', async () => {
      await rejects(api('items').insertMany({ name: 'a' }), /insertMany takes a list of rows/);
    });
  });

  describe('get', () => {
    it('finds a row by a single key value', async () => {
      await api('items').insert({ name: 'a' });
      expect(await api('items').get(1)).toMatchObject({ name: 'a' });
      expect(await api('items').get(2)).toBeNull();
      expect(await api('items').get({ id: 1 })).toMatchObject({ name: 'a' });
    });

    it('finds a row by a composite key object', async () => {
      await api('pairs').insert({ a: 'x', b: 1, v: 'first' });
      await api('pairs').insert({ a: 'x', b: 2, v: 'second' });
      expect(await api('pairs').get({ a: 'x', b: 2 })).toMatchObject({ v: 'second' });
      expect(await api('pairs').get({ a: 'x', b: 3 })).toBeNull();
    });

    it('rejects an incomplete or malformed key', async () => {
      await rejects(api('pairs').get('x'), /The key of "pairs" is an object of its key fields/);
      await rejects(api('pairs').get(null), /The key of "pairs" is an object of its key fields/);
      await rejects(api('pairs').get({ a: 'x' }), /The key of "pairs" needs the field "b"/);
      await rejects(api('pairs').get({ a: 'x', b: null }), /needs the field "b"/);
      await rejects(api('items').get({}), /The key of "items" needs the field "id"/);
    });
  });

  describe('find, findOne and count', () => {
    beforeEach(async () => {
      await api('items').insertMany([
        { name: 'a', qty: 3, price: '1.10' },
        { name: 'b', qty: 1, price: '2.20' },
        { name: 'c', qty: 2, price: '3.30', note: 'n' },
      ]);
    });

    it('filters, orders and pages', async () => {
      const names = async (query?: unknown) =>
        ((await api('items').find(query)) as { name: string }[]).map((row) => row.name);
      expect(await names()).toEqual(['a', 'b', 'c']);
      expect(await names({ where: { qty: { gte: 2 } }, orderBy: [{ field: 'qty' }] })).toEqual(['c', 'a']);
      expect(await names({ orderBy: [{ field: 'qty', direction: 'desc' }], limit: 2 })).toEqual(['a', 'c']);
      expect(await names({ orderBy: [{ field: 'name' }], limit: 1, offset: 1 })).toEqual(['b']);
      expect(await names({ where: { note: null } })).toEqual(['a', 'b']);
      expect(await names({ where: { or: [{ name: 'a' }, { price: '3.30' }] } })).toEqual(['a', 'c']);
    });

    it('findOne returns the first row or null', async () => {
      expect(await api('items').findOne({ orderBy: [{ field: 'qty' }] })).toMatchObject({ name: 'b' });
      expect(await api('items').findOne()).toMatchObject({ name: 'a' });
      expect(await api('items').findOne({ where: { name: 'zzz' } })).toBeNull();
    });

    it('counts matching rows', async () => {
      expect(await api('items').count()).toBe(3);
      expect(await api('items').count({ qty: { gt: 1 } })).toBe(2);
      expect(await api('items').count({ name: 'zzz' })).toBe(0);
    });

    it('rejects a malformed query', async () => {
      await rejects(api('items').find({ where: { ghost: 1 } }), /Unknown field "ghost"/);
      await rejects(api('items').count({ ghost: 1 }), /Unknown field "ghost"/);
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await api('items').insertMany([
        { name: 'a', qty: 3 },
        { name: 'b', qty: 1 },
      ]);
    });

    it('sets values on the matching rows and reports how many', async () => {
      expect(await api('items').update({ qty: { gt: 0 } }, { note: 'n', active: false, price: '9.9' })).toBe(2);
      expect(await api('items').findOne({ where: { name: 'a' } })).toMatchObject({
        note: 'n',
        active: false,
        price: '9.90',
      });
      expect(await api('items').update({ name: 'zzz' }, { note: 'x' })).toBe(0);
    });

    it('sets a field to null and skips undefined entries', async () => {
      await api('items').update({ name: 'a' }, { note: 'n' });
      expect(await api('items').update({ name: 'a' }, { note: null, qty: undefined })).toBe(1);
      expect(await api('items').findOne({ where: { name: 'a' } })).toMatchObject({ note: null, qty: 3 });
    });

    it('increments integers, treating null as zero', async () => {
      await api('items').update({ name: 'a' }, { qty: { increment: 4 } });
      await api('items').update({ name: 'b' }, { qty: { increment: -5 } });
      expect(await api('items').find({ orderBy: [{ field: 'name' }] })).toMatchObject([{ qty: 7 }, { qty: -4 }]);
    });

    it('rejects an invalid patch', async () => {
      await rejects(api('items').update({}, 'x'), /A patch is an object of field values/);
      await rejects(api('items').update({}, null), /A patch is an object of field values/);
      await rejects(api('items').update({}, {}), /A patch needs at least one field/);
      await rejects(api('items').update({}, { qty: undefined }), /A patch needs at least one field/);
      await rejects(api('items').update({}, { ghost: 1 }), /Unknown field "ghost" in a patch of table "items"/);
      await rejects(api('items').update({}, { id: 5 }), /The generated field "id" cannot be changed/);
      await rejects(api('items').update({}, { name: 5 }), /Invalid value for items.name/);
      await rejects(api('items').update({}, { qty: { increment: 1.5 } }), /increment applies to integer fields/);
      await rejects(api('items').update({}, { qty: { increment: '1' } }), /increment applies to integer fields/);
      await rejects(api('items').update({}, { name: { increment: 1 } }), /increment applies to integer fields.*"name"/);
      await rejects(api('items').update({ ghost: 1 }, { qty: 1 }), /Unknown field "ghost"/);
    });
  });

  describe('delete', () => {
    it('removes the matching rows and reports how many', async () => {
      await api('items').insertMany([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
      expect(await api('items').delete({ name: { in: ['a', 'b'] } })).toBe(2);
      expect(await api('items').delete({ name: 'a' })).toBe(0);
      expect(await api('items').count()).toBe(1);
      expect(await api('items').delete(undefined)).toBe(1);
    });
  });

  describe('upsert', () => {
    it('inserts a new row and overwrites the other fields of an existing one', async () => {
      const options = { conflictOn: ['name'] };
      const first = (await api('items').upsert({ name: 'u', qty: 1, note: 'one' }, options)) as { id: number };
      const second = (await api('items').upsert({ name: 'u', qty: 2 }, options)) as Record<string, unknown>;
      expect(second).toMatchObject({ id: first.id, name: 'u', qty: 2, note: null });
      expect(await api('items').count()).toBe(1);
    });

    it('overwrites only the listed fields', async () => {
      const options = { conflictOn: ['name'], update: ['qty'] };
      await api('items').upsert({ name: 'u', qty: 1, note: 'keep' }, options);
      expect(await api('items').upsert({ name: 'u', qty: 9, note: 'ignored' }, options)).toMatchObject({
        qty: 9,
        note: 'keep',
      });
    });

    it('keeps the existing row when nothing may be overwritten', async () => {
      await api('items').upsert({ name: 'u', qty: 1 }, { conflictOn: ['name'], update: [] });
      expect(await api('items').upsert({ name: 'u', qty: 2 }, { conflictOn: ['name'], update: [] })).toMatchObject({
        qty: 1,
      });
    });

    it('conflicts on a primary key, also a composite one', async () => {
      await api('pairs').upsert({ a: 'x', b: 1, v: 'one' }, { conflictOn: ['b', 'a'] });
      expect(await api('pairs').upsert({ a: 'x', b: 1, v: 'two' }, { conflictOn: ['a', 'b'] })).toMatchObject({
        v: 'two',
      });
      expect(await api('pairs').count()).toBe(1);
      await api('flags').upsert({ name: 'f', on: true }, { conflictOn: ['name'] });
      expect(await api('flags').upsert({ name: 'f' }, { conflictOn: ['name'] })).toEqual({ name: 'f', on: false });
    });

    it('rejects an unusable conflict target or key value', async () => {
      await rejects(api('items').upsert({ name: 'u' }, undefined as never), /upsert needs conflictOn/);
      await rejects(api('items').upsert({ name: 'u' }, { conflictOn: [] }), /upsert needs conflictOn/);
      await rejects(api('items').upsert({ name: 'u' }, { conflictOn: 'name' }), /upsert needs conflictOn/);
      await rejects(
        api('items').upsert({ name: 'u' }, { conflictOn: ['ghost'] }),
        /Unknown field "ghost" in conflictOn/,
      );
      await rejects(
        api('items').upsert({ name: 'u' }, { conflictOn: ['qty'] }),
        /conflictOn must be the primary key or a unique index of "items"/,
      );
      await rejects(
        api('pairs').upsert({ a: 'x', b: 1 }, { conflictOn: ['a'] }),
        /must be the primary key or a unique index/,
      );
      await rejects(api('items').upsert({ qty: 1 }, { conflictOn: ['name'] }), /Missing required field "items.name"/);
      await rejects(
        api('items').upsert({ name: 'u' }, { conflictOn: ['id'] }),
        /upsert needs a value for the key field "items.id"/,
      );
      await rejects(
        api('items').upsert({ name: 'u' }, { conflictOn: ['name'], update: ['name'] }),
        /update may not list a field of conflictOn/,
      );
      await rejects(
        api('items').upsert({ name: 'u' }, { conflictOn: ['name'], update: ['ghost'] }),
        /Unknown field "ghost" in update/,
      );
      await rejects(
        api('items').upsert({ name: 'u' }, { conflictOn: ['name'], update: [5] }),
        /Unknown field "5" in update/,
      );
    });

    it('rejects a key field given as null', async () => {
      await rejects(
        api('pairs').upsert({ a: 'x', b: 1, v: null }, { conflictOn: ['v'] }),
        /conflictOn must be the primary key or a unique index/,
      );
    });
  });

  describe('aggregate', () => {
    it('reports min, max, sum and count of integer and decimal fields', async () => {
      await api('items').insertMany([
        { name: 'a', qty: 3, price: '1.10' },
        { name: 'b', qty: -1, price: '2.25' },
        { name: 'c', qty: 2, price: '3.00' },
      ]);
      expect(await api('items').aggregate('qty')).toEqual({ min: -1, max: 3, sum: 4, count: 3 });
      expect(await api('items').aggregate('price', { qty: { gt: 0 } })).toEqual({
        min: '1.10',
        max: '3.00',
        sum: '4.10',
        count: 2,
      });
    });

    it('reports min and max of timestamps and dates without a sum', async () => {
      await api('items').insertMany([
        { name: 'a', due: '2026-01-05', moment: new Date('2026-01-01T00:00:00.000Z') },
        { name: 'b', due: '2026-01-02', moment: new Date('2026-02-01T00:00:00.000Z') },
      ]);
      expect(await api('items').aggregate('due')).toEqual({
        min: '2026-01-02',
        max: '2026-01-05',
        sum: null,
        count: 2,
      });
      expect(await api('items').aggregate('moment')).toEqual({
        min: new Date('2026-01-01T00:00:00.000Z'),
        max: new Date('2026-02-01T00:00:00.000Z'),
        sum: null,
        count: 2,
      });
    });

    it('reports nothing for an empty selection', async () => {
      expect(await api('items').aggregate('qty')).toEqual({ min: null, max: null, sum: null, count: 0 });
      expect(await api('items').aggregate('due')).toEqual({ min: null, max: null, sum: null, count: 0 });
    });

    it('rejects fields it cannot aggregate and unknown fields', async () => {
      await rejects(
        api('items').aggregate('name'),
        /aggregate applies to integer, decimal, timestamp and date fields \("name"\)/,
      );
      await rejects(api('items').aggregate('active'), /aggregate applies to/);
      await rejects(api('items').aggregate('ghost'), /Unknown field "ghost" in aggregate of table "items"/);
      await rejects(api('items').aggregate('qty', { ghost: 1 }), /Unknown field "ghost"/);
    });
  });

  it('runs reads and writes through the session of the call', async () => {
    const calls: string[] = [];
    const scope = {} as never;
    const sessions: PluginStorageSessions = {
      run: (access, given, work) => {
        calls.push(`${access}:${given === scope}`);
        return work(new ManagerExecutor(runner.manager));
      },
    };
    const scoped = createRecordPort(
      new Map([
        ...compilePluginStorage(
          'demo',
          {
            tables: { bare: definitions.bare },
            migrations: [{ version: 1, name: 'b', steps: [step.createTable('bare', definitions.bare)] }],
          },
          { reservedTables: new Set() },
        ).tables,
      ]),
      sqliteStorageDialect,
      sessions,
    ) as unknown as Record<string, Api>;
    await scoped.bare.insert({}, { scope });
    await scoped.bare.find(undefined, { scope });
    await scoped.bare.count(undefined);
    expect(calls).toEqual(['write:true', 'read:true', 'read:false']);
  });

  it('passes neutral errors of a session through', async () => {
    const failing: PluginStorageSessions = { run: () => Promise.reject(new PluginStorageInvalid('bad')) };
    const broken = createRecordPort(
      compilePluginStorage(
        'demo',
        {
          tables: { bare: definitions.bare },
          migrations: [{ version: 1, name: 'b', steps: [step.createTable('bare', definitions.bare)] }],
        },
        { reservedTables: new Set() },
      ).tables,
      sqliteStorageDialect,
      failing,
    ) as unknown as Record<string, Api>;
    await expect(broken.bare.find()).rejects.toBeInstanceOf(PluginStorageInvalid);
  });
});

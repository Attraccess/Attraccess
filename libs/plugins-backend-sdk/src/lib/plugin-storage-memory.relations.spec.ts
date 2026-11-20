import { createInMemoryPluginStorage } from './plugin-storage-memory';
import { PluginStorageInvalid, definePluginStorage, f, table } from './plugin-storage';
import { storage as definition } from './plugin-storage-memory.fixtures';

function setup() {
  const fake = createInMemoryPluginStorage(definition);
  return { fake, db: fake.storage.open(definition) };
}

describe('in-memory plugin storage: foreign keys', () => {
  it('refuses a child whose parent does not exist, and accepts a NULL reference', async () => {
    const { db } = setup();
    await expect(db.children.insert({ parentId: 7, label: 'x' })).rejects.toBeInstanceOf(PluginStorageInvalid);
    await db.children.insert({ label: 'orph' });
    const parent = await db.parents.insert({ name: 'p' });
    await db.children.insert({ parentId: parent.id, label: 'x' });
    expect(await db.children.count()).toBe(2);
  });

  it('cascades deletes through the declared on-delete action, and reports only the direct count', async () => {
    const { db } = setup();
    const p1 = await db.parents.insert({ name: 'p1' });
    const p2 = await db.parents.insert({ name: 'p2' });
    await db.children.insertMany([
      { parentId: p1.id, label: 'a' },
      { parentId: p1.id, label: 'b' },
      { parentId: p2.id, label: 'c' },
    ]);
    expect(await db.parents.delete({ id: p1.id })).toBe(1);
    expect((await db.children.find()).map((row) => row.label)).toEqual(['c']);
  });

  it('sets the key to NULL for set-null and refuses the delete for the default action', async () => {
    const { db } = setup();
    const parent = await db.parents.insert({ name: 'p' });
    await db.nullable.insert({ parentId: parent.id });
    await db.guarded.insert({ parentId: parent.id });
    await expect(db.parents.delete({ id: parent.id })).rejects.toBeInstanceOf(PluginStorageInvalid);
    expect(await db.parents.count()).toBe(1);
    expect(await db.nullable.count({ parentId: parent.id })).toBe(1);
    await db.guarded.delete({});
    await db.parents.delete({ id: parent.id });
    expect((await db.nullable.find())[0].parentId).toBeNull();
  });

  it('refuses an update that orphans children or points a child at nothing', async () => {
    const { db } = setup();
    const parent = await db.parents.insert({ name: 'p' });
    const child = await db.guarded.insert({ parentId: parent.id });
    await expect(db.guarded.update({ id: child.id }, { parentId: 99 })).rejects.toBeInstanceOf(PluginStorageInvalid);
    await expect(db.parents.update({ id: parent.id }, { name: 'q' })).resolves.toBe(1);
  });
});

describe('in-memory plugin storage: definition validation', () => {
  const create = (tables: Record<string, ReturnType<typeof table>>) =>
    createInMemoryPluginStorage(definePluginStorage({ tables, migrations: [] }));

  it.each([
    ['a table without a primary key', { t: table({ a: f.integer() }) }],
    ['a table without fields', { t: table({}) }],
    ['an undeclared primary key field', { t: table({ a: f.integer() }, { primaryKey: ['b'] }) }],
    ['a nullable primary key', { t: table({ a: f.integer().optional() }, { primaryKey: ['a'] }) }],
    ['a generated field outside the key', { t: table({ id: f.id(), g: f.id() }, { primaryKey: ['id'] }) }],
    ['an index on an undeclared field', { t: table({ id: f.id() }, { indexes: [{ fields: ['x'] }] }) }],
    ['a default of the wrong type', { t: table({ id: f.id(), n: f.integer().withDefault('x') }) }],
    ['now on a non-timestamp', { t: table({ id: f.id(), n: f.integer().withDefault({ now: true }) }) }],
    [
      'a foreign key to an unknown table',
      { t: table({ id: f.id() }, { foreignKeys: [{ fields: ['id'], references: 'x', referencedFields: ['id'] }] }) },
    ],
    [
      'a foreign key to a non-unique field',
      {
        p: table({ id: f.id(), v: f.integer() }),
        t: table(
          { id: f.id(), r: f.integer() },
          { foreignKeys: [{ fields: ['r'], references: 'p', referencedFields: ['v'] }] },
        ),
      },
    ],
    [
      'a foreign key with mismatching types',
      {
        p: table({ id: f.id() }),
        t: table(
          { id: f.id(), r: f.string() },
          { foreignKeys: [{ fields: ['r'], references: 'p', referencedFields: ['id'] }] },
        ),
      },
    ],
    [
      'a foreign key with different arity',
      {
        p: table({ id: f.id() }),
        t: table(
          { id: f.id() },
          { foreignKeys: [{ fields: ['id'], references: 'p', referencedFields: ['id', 'id'] }] },
        ),
      },
    ],
  ])('rejects %s', (_label, tables) => {
    expect(() => create(tables as never)).toThrow(PluginStorageInvalid);
  });
});

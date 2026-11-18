import { f, table } from '@attraccess/plugins-backend-sdk';
import {
  compileField,
  compileTable,
  defaultInputOf,
  derivedTableName,
  fieldSignature,
  namespaceOf,
  physicalTableName,
  type StorageNaming,
  tableSignature,
} from './storage-compile';
import { PluginStorageDeclarationError } from './storage-model';

const naming: StorageNaming = { pluginName: 'demo', namespace: 'demo', reservedTables: new Set(['users']) };
const physicalOf = (logical: string) => (logical === 'parents' ? 'plugin_demo_parents' : undefined);

const compile = (decl: unknown, logical = 'items') =>
  compileTable(naming, logical, decl, `plugin_demo_${logical}`, physicalOf);
const field = (decl: unknown, name = 'value') => compileField(naming, 'items', name, decl);
const declaration = (extra: Record<string, unknown> = {}, fields: Record<string, unknown> = {}) => ({
  fields: { id: f.id(), name: f.string(), ...fields },
  primaryKey: ['id'],
  ...extra,
});

describe('namespaceOf', () => {
  it('derives a lowercase identifier from the plugin name', () => {
    expect(namespaceOf('My-Plugin 2')).toBe('my_plugin_2');
    expect(namespaceOf('@scope/thing')).toBe('scope_thing');
  });

  it('refuses names that leave nothing usable', () => {
    expect(() => namespaceOf('123')).toThrow(PluginStorageDeclarationError);
    expect(() => namespaceOf('---')).toThrow(/cannot be turned into a storage namespace/);
    expect(() => namespaceOf('a'.repeat(42))).toThrow(PluginStorageDeclarationError);
  });
});

describe('physicalTableName', () => {
  it('derives plugin_<plugin>_<snake_case>', () => {
    expect(derivedTableName(naming, 'bookingSlots')).toBe('plugin_demo_booking_slots');
    expect(physicalTableName(naming, 'bookingSlots', undefined)).toBe('plugin_demo_booking_slots');
  });

  it('accepts an adopted name inside the namespace', () => {
    expect(physicalTableName(naming, 'items', 'plugin_demo_old')).toBe('plugin_demo_old');
    expect(physicalTableName(naming, 'items', 'demo_old')).toBe('demo_old');
  });

  it.each([
    ['a bad logical name', 'bad name', undefined, /table name "bad name" must match/],
    ['a non-string physical name', 'items', 5, /physicalName of table "items" must match/],
    ['a malformed physical name', 'items', 'plugin demo', /physicalName of table "items" must match/],
    ['a name outside the namespace', 'items', 'other_items', /must start with "plugin_demo_" or "demo_"/],
    ['a host table outside the namespace', 'items', 'users', /must start with/],
  ])('rejects %s', (_label, logical, explicit, message) => {
    expect(() => physicalTableName(naming, logical, explicit)).toThrow(message);
  });

  it('rejects names that use a reserved prefix or belong to the host', () => {
    const host: StorageNaming = {
      ...naming,
      namespace: 'sqlite',
      reservedTables: new Set(['demo_users', 'Demo_Cased']),
    };
    expect(() => physicalTableName(host, 'items', 'sqlite_items')).toThrow(/prefix the host reserves/);
    const plugin: StorageNaming = { ...naming, reservedTables: new Set(['demo_users', 'Demo_Cased']) };
    expect(() => physicalTableName(plugin, 'items', 'demo_users')).toThrow(/belongs to the host/);
    expect(() => physicalTableName(plugin, 'items', 'Demo_Cased')).toThrow(/belongs to the host/);
  });
});

describe('physicalTableName with sibling plugins', () => {
  // A namespace is a plain prefix: plugin "demo" and plugin "demo-extra" (namespace demo_extra) share "plugin_demo_".
  const withSiblings: StorageNaming = { ...naming, siblingNamespaces: new Set(['demo_extra', 'other']) };

  it.each([
    ['a derived name that lands in the namespace of a longer-named plugin', 'extra_notes', undefined],
    ['an adopted name in the namespace of a longer-named plugin', 'notes', 'plugin_demo_extra_notes'],
    ['an adopted short-prefix name in that namespace', 'notes', 'demo_extra_notes'],
  ])('rejects %s', (_label, logical, explicit) => {
    expect(() => physicalTableName(withSiblings, logical, explicit)).toThrow(
      /lies in the storage namespace "demo_extra" of another installed plugin/,
    );
  });

  it('keeps names that only share the prefix with an unrelated or shorter-named plugin', () => {
    expect(physicalTableName(withSiblings, 'notes', undefined)).toBe('plugin_demo_notes');
    expect(physicalTableName(withSiblings, 'extras', undefined)).toBe('plugin_demo_extras');
    const child: StorageNaming = { ...naming, pluginName: 'demo-extra', namespace: 'demo_extra', siblingNamespaces: new Set(['demo']) };
    expect(physicalTableName(child, 'notes', undefined)).toBe('plugin_demo_extra_notes');
  });
});

describe('compileField', () => {
  it('compiles a declared field with every option', () => {
    expect(field(f.string({ length: 10, column: 'val' }).withDefault('x'))).toEqual({
      name: 'value',
      column: 'val',
      type: 'string',
      nullable: false,
      hasDefault: true,
      default: 'x',
      length: 10,
      precision: undefined,
      scale: undefined,
      generated: false,
    });
    expect(field(f.id())).toMatchObject({ generated: true, hasDefault: true, column: 'value' });
    expect(field(f.uuidId())).toMatchObject({ generated: true, type: 'uuid' });
  });

  it('rejects names and shapes that are not allowed', () => {
    expect(() => field(f.text(), 'and')).toThrow(/field name "items.and" is not allowed/);
    expect(() => field(f.text(), '1bad')).toThrow(/is not allowed/);
    expect(() => field('text')).toThrow(/must be built with the f\.\* constructors/);
    expect(() => field(null)).toThrow(/must be built with the f\.\* constructors/);
    expect(() => field({ type: 'blob' })).toThrow(/unknown type "blob"/);
    expect(() => field({ type: 'text', column: 7 })).toThrow(/column of field items.value is not allowed/);
    expect(() => field({ type: 'text', column: 'a-b' })).toThrow(/column of field items.value is not allowed/);
  });

  it('allows generated integer and uuid fields only', () => {
    expect(() => field({ type: 'text', generated: true })).toThrow(/must be an integer or uuid/);
  });

  describe('length', () => {
    it.each([0, -1, 1.5])('rejects the length %s on a string field', (length) => {
      expect(() => field({ type: 'string', length })).toThrow(/length of items.value must be a positive integer/);
    });

    it('rejects a length on any other type', () => {
      expect(() => field({ type: 'text', length: 5 })).toThrow(/on a string field/);
    });
  });

  describe('decimal precision and scale', () => {
    it('accepts a valid declaration', () => {
      expect(field(f.decimal(15, 15))).toMatchObject({ precision: 15, scale: 15 });
      expect(field(f.decimal(1, 0))).toMatchObject({ precision: 1, scale: 0 });
    });

    it.each([
      ['no precision', { type: 'decimal', scale: 1 }],
      ['no scale', { type: 'decimal', precision: 4 }],
      ['a fractional precision', { type: 'decimal', precision: 4.5, scale: 1 }],
      ['a fractional scale', { type: 'decimal', precision: 4, scale: 1.5 }],
      ['a zero precision', { type: 'decimal', precision: 0, scale: 0 }],
      ['a precision above 15', { type: 'decimal', precision: 16, scale: 2 }],
      ['a negative scale', { type: 'decimal', precision: 4, scale: -1 }],
      ['a scale above the precision', { type: 'decimal', precision: 4, scale: 5 }],
    ])('rejects %s', (_label, decl) => {
      expect(() => field(decl)).toThrow(/needs 1 <= precision <= 15 and 0 <= scale <= precision/);
    });

    it('rejects precision and scale on other types', () => {
      expect(() => field({ type: 'integer', precision: 4 })).toThrow(/apply to decimal fields only/);
      expect(() => field({ type: 'integer', scale: 1 })).toThrow(/apply to decimal fields only/);
    });
  });

  describe('defaults', () => {
    it('accepts literal, null and now defaults', () => {
      expect(field(f.integer().withDefault(3)).default).toBe(3);
      expect(field(f.integer().optional().withDefault(null)).default).toBeNull();
      expect(field(f.timestamp().withDefault({ now: true })).default).toEqual({ now: true });
      expect(field(f.timestamp().withDefault('2026-01-01T00:00:00Z')).default).toBe('2026-01-01T00:00:00Z');
      expect(field(f.json().withDefault('{"a":1}')).default).toBe('{"a":1}');
      expect(field(f.decimal(5, 2).withDefault('1.5')).default).toBe('1.5');
    });

    it('rejects a default on a generated field', () => {
      expect(() => field({ type: 'integer', generated: true, default: 1 })).toThrow(/cannot have a default/);
    });

    it('rejects null as the default of a required field', () => {
      expect(() => field({ type: 'integer', nullable: false, default: null })).toThrow(/cannot default to null/);
    });

    it('rejects an object default other than now on a timestamp', () => {
      expect(() => field({ type: 'integer', default: { now: true } })).toThrow(/default of items.value is not valid/);
      expect(() => field({ type: 'timestamp', default: { now: false } })).toThrow(
        /default of items.value is not valid/,
      );
    });

    it('rejects a literal the type cannot hold, with the reason', () => {
      expect(() => field({ type: 'integer', default: 'seven' })).toThrow(
        /default of items.value is not valid: Invalid value for items.value \(integer\): expected a safe integer/,
      );
      expect(() => field({ type: 'string', length: 2, default: 'abc' })).toThrow(/longer than 2 characters/);
      expect(() => field({ type: 'timestamp', default: 'yesterday' })).toThrow(/expected a valid Date/);
      expect(() => field({ type: 'json', default: '{not json' })).toThrow(/default of items.value is not valid/);
    });
  });
});

describe('defaultInputOf', () => {
  it('turns JSON defaults into values, timestamp defaults into Dates, others as they are', () => {
    const base = { name: 'v', column: 'v', nullable: false, hasDefault: true, generated: false } as const;
    expect(defaultInputOf({ ...base, type: 'json' }, '{"a":[1]}')).toEqual({ a: [1] });
    expect(defaultInputOf({ ...base, type: 'timestamp' }, '2026-01-02T03:04:05.000Z')).toEqual(
      new Date('2026-01-02T03:04:05.000Z'),
    );
    expect(defaultInputOf({ ...base, type: 'integer' }, 4)).toBe(4);
  });
});

describe('compileTable', () => {
  it('compiles fields, keys, indexes and foreign keys into physical names', () => {
    const compiled = compile(
      declaration(
        {
          indexes: [
            { fields: ['name'] },
            { fields: ['name', 'id'], unique: true },
            { name: 'IDX_demo_custom', fields: ['id'] },
          ],
          foreignKeys: [
            { fields: ['parentId'], references: 'parents', referencedFields: ['id'], onDelete: 'set-null' },
          ],
        },
        { parentId: f.integer().optional() },
      ),
    );
    expect(compiled.physical).toBe('plugin_demo_items');
    expect([...compiled.fields.keys()]).toEqual(['id', 'name', 'parentId']);
    expect(compiled.primaryKey).toEqual(['id']);
    expect(compiled.indexes).toEqual([
      { name: 'idx_plugin_demo_items_name', fields: ['name'], unique: false },
      { name: 'uq_plugin_demo_items_name_id', fields: ['name', 'id'], unique: true },
      { name: 'IDX_demo_custom', fields: ['id'], unique: false },
    ]);
    expect(compiled.foreignKeys).toEqual([
      {
        fields: ['parentId'],
        references: 'parents',
        referencesPhysical: 'plugin_demo_parents',
        referencedFields: ['id'],
        onDelete: 'set-null',
      },
    ]);
  });

  it('compiles a table without indexes or foreign keys', () => {
    const compiled = compile({ fields: { id: f.id() }, primaryKey: ['id'] });
    expect(compiled.indexes).toEqual([]);
    expect(compiled.foreignKeys).toEqual([]);
  });

  it('shortens generated index names beyond 63 characters with a digest', () => {
    const longName = 'a'.repeat(40);
    const decl = declaration({ indexes: [{ fields: ['id', longName] }] }, { [longName]: f.integer() });
    const [index] = compile(decl).indexes;
    expect(index.name).toHaveLength(63);
    expect(index.name).toMatch(/^idx_plugin_demo_items_id_a+_[0-9a-f]{10}$/);
    // Stable: the same declaration always yields the same name.
    expect(compile(decl).indexes[0].name).toBe(index.name);
  });

  it.each([
    ['a table that is no declaration', 'items', 'table', /table "items" must be built with table\(\)/],
    ['a declaration without fields', 'items', { primaryKey: ['id'] }, /must be built with table\(\)/],
    ['a table without any field', 'items', { fields: {}, primaryKey: ['id'] }, /declares no fields/],
    [
      'two fields on one column',
      'items',
      { fields: { id: f.id(), a: f.text({ column: 'x' }), b: f.text({ column: 'x' }) }, primaryKey: ['id'] },
      /maps two fields to column "x"/,
    ],
    ['a missing primary key', 'items', { fields: { id: f.id() } }, /primaryKey of "items" must be a non-empty list/],
    ['an empty primary key', 'items', { fields: { id: f.id() }, primaryKey: [] }, /must be a non-empty list/],
    [
      'a non-string primary key entry',
      'items',
      { fields: { id: f.id() }, primaryKey: [1] },
      /must be a non-empty list/,
    ],
    ['an unknown key field', 'items', { fields: { id: f.id() }, primaryKey: ['nope'] }, /unknown field "nope"/],
    [
      'a nullable key field',
      'items',
      { fields: { id: f.integer().optional() }, primaryKey: ['id'] },
      /primary key field "items.id" cannot be nullable/,
    ],
    [
      'two generated fields',
      'items',
      { fields: { id: f.id(), other: f.uuidId() }, primaryKey: ['id'] },
      /generated field must be the whole primary key/,
    ],
    [
      'a generated field outside a composite key',
      'items',
      { fields: { id: f.id(), n: f.text() }, primaryKey: ['id', 'n'] },
      /generated field must be the whole primary key/,
    ],
    [
      'a generated field that is not the key',
      'items',
      { fields: { id: f.id(), n: f.text() }, primaryKey: ['n'] },
      /generated field must be the whole primary key/,
    ],
  ])('rejects %s', (_label, logical, decl, message) => {
    expect(() => compile(decl, logical)).toThrow(PluginStorageDeclarationError);
    expect(() => compile(decl, logical)).toThrow(message);
  });

  it('accepts a composite key of ordinary fields', () => {
    const compiled = compile({ fields: { a: f.string(), b: f.integer() }, primaryKey: ['a', 'b'] });
    expect(compiled.primaryKey).toEqual(['a', 'b']);
  });

  describe('indexes', () => {
    it.each([
      ['a malformed index', ['nope'], /an index of "items" is malformed/],
      ['an index without fields', [{ fields: [] }], /must be a non-empty list of field names/],
      ['an index on an unknown field', [{ fields: ['nope'] }], /names the unknown field "nope"/],
      [
        'an index name that is not an identifier',
        [{ name: 'bad name', fields: ['name'] }],
        /index name "bad name" must match/,
      ],
      ['a non-string index name', [{ name: 5, fields: ['name'] }], /index name "5" must match/],
      ['an index name outside the namespace', [{ name: 'idx_other', fields: ['name'] }], /contain "demo"/],
      [
        'the same index twice',
        [
          { name: 'idx_DEMO_a', fields: ['name'] },
          { name: 'idx_demo_a', fields: ['id'] },
        ],
        /declares the index "idx_demo_a" twice/,
      ],
    ])('rejects %s', (_label, indexes, message) => {
      expect(() => compile(declaration({ indexes }))).toThrow(message);
    });
  });

  describe('foreign keys', () => {
    const withKey = (key: unknown) => declaration({ foreignKeys: [key] }, { parentId: f.integer() });
    const valid = { fields: ['parentId'], references: 'parents', referencedFields: ['id'] };

    it('compiles a key without an onDelete action', () => {
      expect(compile(withKey(valid)).foreignKeys[0].onDelete).toBeUndefined();
      for (const onDelete of ['cascade', 'restrict', 'set-null']) {
        expect(compile(withKey({ ...valid, onDelete })).foreignKeys[0].onDelete).toBe(onDelete);
      }
    });

    it.each([
      ['a malformed key', 'parents', /a foreign key of "items" is malformed/],
      ['a key without fields', { ...valid, fields: [] }, /must be a non-empty list of field names/],
      ['a key without referenced fields', { ...valid, referencedFields: undefined }, /must be a non-empty list/],
      ['an unknown own field', { ...valid, fields: ['nope'] }, /names the unknown field "nope"/],
      ['unequal field lists', { ...valid, referencedFields: ['id', 'other'] }, /pairs unequal field lists/],
      [
        'an unknown table',
        { ...valid, references: 'ghosts' },
        /references "ghosts", which is not a table of this plugin/,
      ],
      ['a non-string table', { ...valid, references: 4 }, /references "4", which is not a table/],
      ['an unknown onDelete', { ...valid, onDelete: 'explode' }, /has an unknown onDelete/],
    ])('rejects %s', (_label, key, message) => {
      expect(() => compile(withKey(key))).toThrow(message);
    });
  });
});

describe('signatures', () => {
  const items = compile(declaration({ indexes: [{ fields: ['name'] }] }));

  it('compare equal for equal declarations and differ on any structural change', () => {
    expect(tableSignature(compile(declaration({ indexes: [{ fields: ['name'] }] })))).toBe(tableSignature(items));
    expect(tableSignature(compile(declaration()))).not.toBe(tableSignature(items));
    expect(tableSignature(compile(declaration({}, { extra: f.text() })))).not.toBe(
      tableSignature(compile(declaration())),
    );
  });

  it('fieldSignature covers compiled and declared fields alike', () => {
    const declared = table({ id: f.id(), n: f.integer() });
    expect(fieldSignature(declared.fields.n)).toBe(
      JSON.stringify(['integer', false, false, null, null, null, null, false, null]),
    );
    expect(fieldSignature(items.fields.get('id') as never)).toBe(
      JSON.stringify(['integer', false, true, null, null, null, null, true, 'id']),
    );
  });
});

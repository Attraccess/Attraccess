import { describe, expect, it } from 'vitest';
import {
  buildCsv,
  collectMetadataKeys,
  ConfiguredColumn,
  defaultColumns,
  escapeCsvValue,
  FieldDefinition,
  fromTemplateColumns,
  metadataFields,
  newColumnUid,
  resolveColumns,
  toTemplateColumns,
} from './csv';

type Row = { name: string; note?: string | null; meta?: Record<string, unknown> | null };

const fields: FieldDefinition<Row>[] = [
  { key: 'name', label: 'Name', getter: (row) => row.name, selectedByDefault: true },
  { key: 'note', label: 'Note', getter: (row) => row.note },
  { key: 'flag', label: 'Flag', getter: () => 0, selectedByDefault: true },
];

const col = (partial: Partial<ConfiguredColumn> & Pick<ConfiguredColumn, 'type'>, uid = 'u'): ConfiguredColumn => ({
  uid,
  header: '',
  ...partial,
});

describe('escapeCsvValue', () => {
  it.each([
    ['plain', 'plain'],
    ['a;b', '"a;b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line1\nline2', '"line1\nline2"'],
    ['line1\rline2', '"line1\rline2"'],
    ['', ''],
  ])('escapes %j', (input, expected) => {
    expect(escapeCsvValue(input)).toBe(expected);
  });
});

describe('buildCsv', () => {
  const items: Row[] = [
    { name: 'Alice', note: 'x;y' },
    { name: 'Bob', note: null },
  ];

  it('uses the field label for an empty header and the custom header otherwise', () => {
    const columns = resolveColumns(
      [col({ type: 'field', fieldKey: 'name' }, 'a'), col({ type: 'field', fieldKey: 'note', header: 'Remark' }, 'b')],
      fields,
    );
    expect(buildCsv(columns, items)).toBe('Name;Remark\nAlice;"x;y"\nBob;');
  });

  it('writes constants on every row, including an empty constant', () => {
    const columns = resolveColumns(
      [
        col({ type: 'constant', header: 'Org', value: 'maker' }, 'a'),
        col({ type: 'constant', header: 'Blank', value: '' }, 'b'),
        col({ type: 'field', fieldKey: 'name' }, 'c'),
      ],
      fields,
    );
    expect(buildCsv(columns, items)).toBe('Org;Blank;Name\nmaker;;Alice\nmaker;;Bob');
  });

  it('keeps the configured order and allows the same field twice', () => {
    const columns = resolveColumns(
      [
        col({ type: 'field', fieldKey: 'note' }, 'a'),
        col({ type: 'field', fieldKey: 'name' }, 'b'),
        col({ type: 'field', fieldKey: 'name', header: 'Again' }, 'c'),
      ],
      fields,
    );
    expect(buildCsv(columns, [items[0]])).toBe('Note;Name;Again\n"x;y";Alice;Alice');
  });

  it('escapes headers and values containing separators, quotes and line breaks', () => {
    const columns = resolveColumns(
      [
        col({ type: 'field', fieldKey: 'name', header: 'A;"B"\nC\rD' }, 'a'),
        col({ type: 'constant', header: 'k', value: 'v"1' }, 'b'),
      ],
      fields,
    );
    expect(buildCsv(columns, [{ name: 'a\nb' }])).toBe('"A;""B""\nC\rD";k\n"a\nb";"v""1"');
  });

  it('renders null, undefined and zero values correctly', () => {
    const columns = resolveColumns(
      [col({ type: 'field', fieldKey: 'note' }, 'a'), col({ type: 'field', fieldKey: 'flag' }, 'b')],
      fields,
    );
    expect(buildCsv(columns, [{ name: 'x' }, { name: 'y', note: null }])).toBe('Note;Flag\n;0\n;0');
  });

  it('exports a stale or unknown field as an empty column with its header and flags it unavailable', () => {
    const columns = resolveColumns(
      [
        col({ type: 'field', fieldKey: 'gone', header: 'Old' }, 'a'),
        col({ type: 'field', fieldKey: 'gone2' }, 'b'),
        col({ type: 'field', fieldKey: 'name' }, 'c'),
      ],
      fields,
    );
    expect(columns.map((column) => column.isAvailable)).toEqual([false, false, true]);
    expect(buildCsv(columns, items)).toBe('Old;gone2;Name\n;;Alice\n;;Bob');
  });

  it('emits only the header row without items', () => {
    expect(buildCsv(resolveColumns([col({ type: 'field', fieldKey: 'name' })], fields), [])).toBe('Name');
  });
});

describe('column helpers', () => {
  it('starts with the selectedByDefault fields in order and empty headers', () => {
    expect(defaultColumns(fields).map(({ type, fieldKey, header }) => ({ type, fieldKey, header }))).toEqual([
      { type: 'field', fieldKey: 'name', header: '' },
      { type: 'field', fieldKey: 'flag', header: '' },
    ]);
  });

  it('derives default uids from the field key so rebuilding the fields keeps them', () => {
    const uids = defaultColumns(fields).map((column) => column.uid);
    expect(defaultColumns(fields.map((field) => ({ ...field }))).map((column) => column.uid)).toEqual(uids);
    // user-added and template columns can never collide with a default uid
    expect(uids).not.toContain(newColumnUid());
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('round-trips through the template shape without leaking uids', () => {
    const configured = [
      col({ type: 'field', fieldKey: 'name', header: 'N' }, 'a'),
      col({ type: 'constant', header: 'k', value: '' }, 'b'),
    ];
    const stored = toTemplateColumns(configured);
    expect(stored).toEqual([
      { type: 'field', header: 'N', fieldKey: 'name' },
      { type: 'constant', header: 'k', value: '' },
    ]);
    expect(fromTemplateColumns(stored).map(({ uid: _uid, ...rest }) => rest)).toEqual([
      { type: 'field', header: 'N', fieldKey: 'name' },
      { type: 'constant', header: 'k', value: '' },
    ]);
  });
});

describe('metadata fields', () => {
  const rows: Row[] = [
    { name: 'a', meta: { costCenter: 4711, tags: ['x', 'y'], nested: { a: 1 } } },
    { name: 'b', meta: null },
    { name: 'c', meta: { costCenter: null, extra: 'e' } },
  ];
  const getMeta = (row: Row) => row.meta;

  it('collects each key once', () => {
    expect(collectMetadataKeys(rows, getMeta)).toEqual(['costCenter', 'tags', 'nested', 'extra']);
  });

  it('stringifies values, objects and arrays as JSON, null as empty', () => {
    const defs = metadataFields(rows, getMeta, (key) => `Meta: ${key}`);
    const byKey = Object.fromEntries(defs.map((def) => [def.key, def]));
    expect(byKey['resourceMetadata.costCenter'].label).toBe('Meta: costCenter');
    expect(byKey['resourceMetadata.costCenter'].getter(rows[0])).toBe('4711');
    expect(byKey['resourceMetadata.tags'].getter(rows[0])).toBe('["x","y"]');
    expect(byKey['resourceMetadata.nested'].getter(rows[0])).toBe('{"a":1}');
    expect(byKey['resourceMetadata.costCenter'].getter(rows[1])).toBe('');
    expect(byKey['resourceMetadata.costCenter'].getter(rows[2])).toBe('');
  });
});

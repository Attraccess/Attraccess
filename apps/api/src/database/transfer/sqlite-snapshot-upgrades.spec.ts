import type { DatabaseSnapshot } from '../transfer-snapshot';
import { upgradeSqliteSnapshot } from './sqlite-snapshot-upgrades';

const snapshot = (tables: DatabaseSnapshot['tables']): DatabaseSnapshot =>
  ({ format: 1, backend: 'sqlite', tables }) as unknown as DatabaseSnapshot;

describe('upgradeSqliteSnapshot', () => {
  it('turns every SQLite form into a live resource form', () => {
    const upgraded = upgradeSqliteSnapshot(
      snapshot([
        {
          name: 'form',
          columns: [
            { name: 'id', kind: 'integer' },
            { name: 'resourceId', kind: 'integer' },
          ],
          rows: [
            [7, 1],
            [9, 2],
          ],
        },
      ]),
    );

    expect(upgraded.tables[0].columns.map((column) => [column.name, column.kind])).toEqual([
      ['id', 'integer'],
      ['resourceId', 'integer'],
      ['scope', 'text'],
      ['groupId', 'integer'],
      ['deletedAt', 'timestamp'],
    ]);
    expect(upgraded.tables[0].rows).toEqual([
      [7, 1, 'resource', null, null],
      [9, 2, 'resource', null, null],
    ]);
  });

  it('adds the per-resource override table, empty', () => {
    const [, overrides] = upgradeSqliteSnapshot(snapshot([{ name: 'user', columns: [], rows: [] }])).tables;

    expect(overrides.name).toBe('form_resource_override');
    expect(overrides.rows).toEqual([]);
    expect(overrides.columns.map((column) => column.name)).toContain('disabled');
  });

  it('leaves other tables, a form table that already has the columns and an existing override table alone', () => {
    const user = {
      name: 'user',
      columns: [
        { name: 'id', kind: 'integer' as const },
        { name: 'firstName', kind: 'text' as const },
        { name: 'lastName', kind: 'text' as const },
      ],
      rows: [[1, null, null]],
    };
    const form = {
      name: 'form',
      columns: [
        { name: 'id', kind: 'integer' as const },
        { name: 'scope', kind: 'text' as const },
        { name: 'groupId', kind: 'integer' as const },
        { name: 'deletedAt', kind: 'timestamp' as const },
      ],
      rows: [[3, 'global', null, null]],
    };

    const overrides = { name: 'form_resource_override', columns: [], rows: [] };

    const upgraded = upgradeSqliteSnapshot(snapshot([user, form, overrides]));

    expect(upgraded.tables).toEqual([user, form, overrides]);
  });
});

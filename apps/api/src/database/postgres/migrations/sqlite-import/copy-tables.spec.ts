import { rowName } from './copy-tables';
import type { SqliteCell } from './sqlite-values';

const cell = (value: unknown): SqliteCell => ({ value, storage: 'text', exact: null });

describe('rowName', () => {
  it('names a row by its primary key', () => {
    expect(rowName({ sqliteColumns: ['id', 'name'], keyIndexes: [0] }, [cell(7), cell('x')], 2)).toBe('row id=7');
  });

  it('names a row by its position when the key is not copied', () => {
    expect(rowName({ sqliteColumns: ['name'], keyIndexes: [-1] }, [cell('x')], 2)).toBe('row 3');
  });

  it('never prints a key that is credential material, such as a token hash', () => {
    const plan = { sqliteColumns: ['tokenHash', 'userId'], keyIndexes: [0] };
    expect(rowName(plan, [cell('9f86d081884c7d65'), cell(1)], 0)).toBe('row 1');
  });
});

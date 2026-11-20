import { SnapshotIncompatibleError, type TableSnapshot } from '../transfer-snapshot';
import { describePostgresError, loadTableRows, type LoadOptions } from './postgres-transfer-load';
import type { ColumnPlan } from './postgres-transfer-values';

describe('describePostgresError', () => {
  it('lists the SQLSTATE, constraint, column and type of a wrapped driver error, never message or detail', () => {
    const error = {
      message: 'insert failed',
      driverError: {
        code: '23505',
        constraint: 'user_email_key',
        column: 'email',
        dataType: 'text',
        detail: 'Key (email)=(secret@example.com) already exists.',
        message: 'duplicate key value for secret@example.com',
      },
    };
    const text = describePostgresError(error);
    expect(text).toBe('SQLSTATE 23505, constraint user_email_key, column email, type text');
    expect(text).not.toContain('secret');
  });

  it('reads a raw pg error and falls back to unknown', () => {
    expect(describePostgresError({ code: '22P02' })).toBe('SQLSTATE 22P02');
    expect(describePostgresError(new Error('password is hunter2'))).toBe('SQLSTATE unknown');
    expect(describePostgresError(undefined)).toBe('SQLSTATE unknown');
  });
});

describe('loadTableRows', () => {
  const plans: ColumnPlan[] = [
    { name: 'id', kind: 'integer', pgType: 'integer' },
    { name: 'name', kind: 'text', pgType: 'text' },
  ];
  const options: LoadOptions = { bind: (_plan, value) => value, placeholder: (index) => `$${index}` };
  const table = (rows: TableSnapshot['rows'], columns = ['id', 'name']): TableSnapshot => ({
    name: 'thing',
    columns: columns.map((name) => ({ name, kind: 'text' as const })),
    rows,
  });

  const recorder = (failOn?: (sql: string, params?: unknown[]) => unknown) => {
    const statements: { sql: string; params?: unknown[] }[] = [];
    const manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        statements.push({ sql, params });
        const failure = failOn?.(sql, params);
        if (failure) throw failure;
        return [];
      }),
    };
    return { manager, statements };
  };

  it('does nothing without rows or columns', async () => {
    const { manager } = recorder();
    await loadTableRows(manager, table([]), plans, options);
    await loadTableRows(manager, table([[1, 'a']]), [], options);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('inserts all rows in one statement, in the column order of the target', async () => {
    const { manager, statements } = recorder();
    await loadTableRows(
      manager,
      table(
        [
          ['a', 1],
          ['b', 2],
        ],
        ['name', 'id'],
      ),
      plans,
      options,
    );
    const insert = statements.find(({ sql }) => sql.startsWith('INSERT'));
    expect(insert?.sql).toBe('INSERT INTO "thing" ("id", "name") VALUES ($1, $2), ($3, $4)');
    expect(insert?.params).toEqual([1, 'a', 2, 'b']);
    expect(statements.map(({ sql }) => sql)).toEqual([
      'SAVEPOINT load_chunk',
      insert?.sql,
      'RELEASE SAVEPOINT load_chunk',
    ]);
  });

  it('splits a table into several statements to stay below the parameter limit', async () => {
    const { manager, statements } = recorder();
    const rows = Array.from({ length: 30_001 }, (_, i) => [i, 'x']);
    await loadTableRows(manager, table(rows), plans, options);
    expect(statements.filter(({ sql }) => sql.startsWith('INSERT'))).toHaveLength(2);
  });

  it('names the offending row and its id, with the constraint but without any value', async () => {
    const failing = {
      driverError: { code: '23505', constraint: 'thing_pkey', detail: 'Key (id)=(2) hunter2 already exists' },
    };
    const { manager, statements } = recorder((sql, params) =>
      sql.startsWith('INSERT') && (params as unknown[]).includes('hunter2') ? failing : undefined,
    );
    const error = await loadTableRows(
      manager,
      table([
        [1, 'a'],
        [2, 'hunter2'],
        [3, 'c'],
      ]),
      plans,
      options,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(SnapshotIncompatibleError);
    expect(error.message).toBe('Table thing, row 2 (id 2) cannot be imported: SQLSTATE 23505, constraint thing_pkey');
    expect(error.message).not.toContain('hunter2');
    expect(statements.map(({ sql }) => sql)).toContain('ROLLBACK TO SAVEPOINT load_chunk');
    expect(statements.map(({ sql }) => sql)).toContain('ROLLBACK TO SAVEPOINT load_row');
  });

  it('hands the binder the 1-based row number and the id of each value, as the errors name rows', async () => {
    const { manager } = recorder();
    const where: string[] = [];
    const binding: LoadOptions = { ...options, bind: (_plan, value, at) => (where.push(at), value) };
    await loadTableRows(
      manager,
      table([
        [7, 'a'],
        [9, 'b'],
      ]),
      plans,
      binding,
    );
    expect(where).toEqual([
      'table thing, row 1 (id 7), column id',
      'table thing, row 1 (id 7), column name',
      'table thing, row 2 (id 9), column id',
      'table thing, row 2 (id 9), column name',
    ]);
  });

  it('omits the id for a table without an id column', async () => {
    const { manager } = recorder((sql) => (sql.startsWith('INSERT') ? { code: '22P02' } : undefined));
    const noId: ColumnPlan[] = [{ name: 'name', kind: 'text', pgType: 'text' }];
    await expect(loadTableRows(manager, table([['a']], ['name']), noId, options)).rejects.toThrow(
      'Table thing, row 1 cannot be imported: SQLSTATE 22P02',
    );
  });

  it('reports the chunk failure when no single row reproduces it', async () => {
    let inserts = 0;
    const { manager } = recorder((sql) =>
      sql.startsWith('INSERT') && inserts++ === 0 ? { code: '40001' } : undefined,
    );
    await expect(
      loadTableRows(
        manager,
        table([
          [1, 'a'],
          [2, 'b'],
        ]),
        plans,
        options,
      ),
    ).rejects.toThrow('Table thing cannot be imported: SQLSTATE 40001');
  });
});

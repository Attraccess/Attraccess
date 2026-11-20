import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { createSqliteWorkspace, migrateSqliteTo, type SqliteWorkspace } from '../transfer/sqlite-import.test-fixture';

const POSTGRES_ACTIONS: Record<string, string> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

/**
 * Where the PostgreSQL schema deliberately differs from the released SQLite schema. A reader link used to block the
 * deletion of its resource (the 2025 migration made the foreign key NO ACTION while the entity said CASCADE, and the
 * entity is what the PostgreSQL baseline is generated from); deleting the resource now removes the link.
 */
const INTENDED_DIFFERENCES = new Map([
  ['attractap_resources_resource.resourceId -> resource', { sqlite: 'NO ACTION', postgres: 'CASCADE' }],
]);

describe('PostgreSQL schema parity with the final SQLite schema', () => {
  let postgres: DataSource;
  let workspace: SqliteWorkspace;
  let sqlite: DataSource;

  beforeAll(async () => {
    postgres = await createTestDataSource();
    workspace = await createSqliteWorkspace();
    process.env.AUTH_SESSION_SECRET ||= 'schema-parity-spec-secret';
    sqlite = await migrateSqliteTo(workspace.file);
  }, 300_000);
  afterAll(async () => {
    await sqlite.destroy();
    await workspace.remove();
    await closeTestDataSource(postgres);
  });

  /** What happens to the child row when the referenced row goes: the behaviour an existing installation relies on. */
  it('keeps every ON DELETE rule of the released SQLite schema', async () => {
    const tables: { name: string }[] = await sqlite.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    const released = new Map<string, string>();
    for (const { name } of tables) {
      const keys: { from: string; table: string; on_delete: string }[] = await sqlite.query(
        `SELECT "from", "table", on_delete FROM pragma_foreign_key_list('${name}')`,
      );
      for (const key of keys) released.set(`${name}.${key.from} -> ${key.table}`, key.on_delete);
    }
    const rows: { child: string; column: string; parent: string; action: string }[] = await postgres.query(`
      SELECT c.conrelid::regclass::text AS child, a.attname AS "column", c.confrelid::regclass::text AS parent,
             c.confdeltype AS action
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace`);
    const current = new Map(
      rows.map((row) => [
        `${row.child.replace(/"/g, '')}.${row.column} -> ${row.parent.replace(/"/g, '')}`,
        row.action,
      ]),
    );

    const differences: string[] = [];
    for (const [key, rule] of released) {
      const now = POSTGRES_ACTIONS[current.get(key) ?? ''] ?? 'missing';
      const intended = INTENDED_DIFFERENCES.get(key);
      if (intended ? now !== intended.postgres || rule !== intended.sqlite : now !== rule) {
        differences.push(`${key}: SQLite ${rule}, PostgreSQL ${now}`);
      }
    }
    for (const key of current.keys()) if (!released.has(key)) differences.push(`${key}: only in PostgreSQL`);
    expect(differences).toEqual([]);
  });
});

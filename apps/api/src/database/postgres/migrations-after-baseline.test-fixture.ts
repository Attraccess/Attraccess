import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { PostgresBaseline1760000000000 } from './migrations/1760000000000-baseline';

async function columnsByTable(source: DataSource): Promise<Map<string, Set<string>>> {
  const rows: { table_name: string; column_name: string }[] = await source.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`,
  );
  const tables = new Map<string, Set<string>>();
  for (const row of rows) {
    const columns = tables.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    tables.set(row.table_name, columns);
  }
  return tables;
}

/**
 * The columns the migrations after the baseline add, by table: the schema of the current release minus the
 * baseline's. Data transferred from SQLite (whose final schema is the baseline) gets them from those migrations.
 */
export async function columnsAddedAfterBaseline(): Promise<Map<string, string[]>> {
  const baseline = await createTestDataSource({ migrations: [PostgresBaseline1760000000000], migrationsRun: true });
  const current = await createTestDataSource();
  try {
    const before = await columnsByTable(baseline);
    const after = await columnsByTable(current);
    const added = new Map<string, string[]>();
    for (const [table, columns] of after) {
      const known = before.get(table) ?? new Set<string>();
      const extra = [...columns].filter((column) => !known.has(column));
      if (extra.length > 0) added.set(table, extra);
    }
    return added;
  } finally {
    await closeTestDataSource(baseline);
    await closeTestDataSource(current);
  }
}

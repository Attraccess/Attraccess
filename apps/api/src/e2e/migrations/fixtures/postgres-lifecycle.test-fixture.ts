import type { DataSource } from 'typeorm';
import { postgresBackend } from '../../../database/postgres/postgres-backend';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
} from '../../../test-utils/test-database';

/** The names of the migrations of the PostgreSQL track (a class whose name ends in its 13 digit timestamp). */
export function trackMigrationNames(): string[] {
  return postgresBackend.migrationTrack.migrations
    .filter((candidate): candidate is new () => unknown => typeof candidate === 'function')
    .map((migration) => migration.name);
}

export interface LifecycleDatabase {
  readonly database: TestDatabaseLocation;
  /** Opens the database like an application start (the previous connection is closed first); migrations are not run. */
  open(options?: { entities?: unknown[] }): Promise<DataSource>;
  close(): Promise<void>;
}

/** One empty PostgreSQL database that specs reopen, like consecutive starts of the application. */
export async function createLifecycleDatabase(): Promise<LifecycleDatabase> {
  const database = await createTestDatabaseLocation({ empty: true });
  let current: DataSource | undefined;
  return {
    database,
    async open(options = {}) {
      await closeTestDataSource(current);
      current = await createTestDataSource({ location: database.location, ...options });
      return current;
    },
    async close() {
      await closeTestDataSource(current);
      current = undefined;
      await database.remove();
    },
  };
}

export async function recordedMigrations(source: Pick<DataSource, 'query'>): Promise<string[]> {
  const rows: { name: string }[] = await source.query('SELECT name FROM migrations ORDER BY id');
  return rows.map((row) => row.name);
}

/** Tables, columns, indexes, constraints and triggers of the schema: equal snapshots mean an equal schema. */
export async function schemaSnapshot(source: Pick<DataSource, 'query'>): Promise<string[]> {
  const lines: string[] = [];
  const add = async (kind: string, sql: string) => {
    for (const row of (await source.query(sql)) as Record<string, string>[]) {
      lines.push(`${kind} ${Object.values(row).join(' | ')}`);
    }
  };
  await add(
    'column',
    `SELECT table_name, column_name, data_type, is_nullable, column_default, is_generated, generation_expression
       FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position`,
  );
  await add(
    'index',
    `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() ORDER BY indexname`,
  );
  await add(
    'constraint',
    `SELECT c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid) FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = current_schema() ORDER BY 1, 2`,
  );
  await add(
    'trigger',
    `SELECT tgrelid::regclass::text, tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2`,
  );
  return lines;
}

import type { DataSource } from 'typeorm';
import { resolveDatabaseBackend } from '../../../database/backend';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
} from '../../../test-utils/test-database';

/** A migration of the released track: a class whose name ends in its 13 digit timestamp. */
export interface TrackMigration {
  readonly timestamp: number;
  readonly name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly migration: new () => any;
}

/** The selected backend's released migrations, oldest first. The track also exports constants; those are skipped. */
export function releasedTrack(): TrackMigration[] {
  return resolveDatabaseBackend()
    .migrationTrack.migrations.filter((candidate): candidate is new () => unknown => typeof candidate === 'function')
    .map((migration) => ({ migration, name: migration.name, timestamp: Number(/(\d{13})$/.exec(migration.name)?.[1]) }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp) as TrackMigration[];
}

/** The released migrations up to and including the one whose class name carries `timestamp`. */
export function trackUpTo(timestamp: number): TrackMigration[] {
  const track = releasedTrack().filter((entry) => entry.timestamp <= timestamp);
  if (!track.some((entry) => entry.timestamp === timestamp)) {
    throw new Error(`No released migration has timestamp ${timestamp}`);
  }
  return track;
}

export interface LifecycleDatabase {
  readonly database: TestDatabaseLocation;
  /**
   * Opens the database file with exactly these migrations known; migrations are not run. Like an application restart,
   * it first closes the connection a previous `open` returned.
   */
  open(migrations: readonly unknown[]): Promise<DataSource>;
  close(): Promise<void>;
}

/** One database file that tests reopen with different migration sets, like consecutive application versions. */
export async function createLifecycleDatabase(): Promise<LifecycleDatabase> {
  const database = await createTestDatabaseLocation('attraccess-lifecycle-');
  let current: DataSource | undefined;
  return {
    database,
    async open(migrations) {
      await closeTestDataSource(current);
      current = await createTestDataSource({ location: database.location, migrations });
      return current;
    },
    async close() {
      await closeTestDataSource(current);
      current = undefined;
      await database.remove();
    },
  };
}

/** Runs pending migrations the way the application does on start (one transaction for the pending batch). */
export async function migrate(source: DataSource): Promise<string[]> {
  return (await source.runMigrations()).map((migration) => migration.name);
}

export async function recordedMigrations(source: DataSource): Promise<string[]> {
  const rows: { name: string }[] = await source.query('SELECT name FROM migrations ORDER BY id');
  return rows.map((row) => row.name);
}

/** Every table, index, trigger and view with its definition: equal snapshots mean an equal schema. */
export async function schemaSnapshot(source: DataSource): Promise<string[]> {
  const rows: { type: string; name: string; sql: string | null }[] = await source.query(
    "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
  );
  return rows.map((row) => `${row.type} ${row.name}: ${row.sql ?? ''}`);
}

export async function assertForeignKeysClean(source: DataSource, context: string): Promise<void> {
  const violations = await source.query('PRAGMA foreign_key_check');
  if (violations.length > 0) {
    throw new Error(`Foreign key violations ${context}: ${JSON.stringify(violations)}`);
  }
}

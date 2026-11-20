import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { sqliteFrozenTrack } from '../sqlite/sqlite-frozen-track';
import { createSqliteSource } from '../sqlite/sqlite-source';

/** A temporary directory that holds the SQLite file of one spec case. */
export interface SqliteWorkspace {
  readonly directory: string;
  /** The SQLite file, named like the file of an installation. */
  readonly file: string;
  remove(): Promise<void>;
}

export async function createSqliteWorkspace(): Promise<SqliteWorkspace> {
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-sqlite-import-'));
  return {
    directory,
    file: join(directory, 'attraccess.sqlite'),
    remove: () => rm(directory, { recursive: true, force: true }),
  };
}

const TYPEORM_METADATA = `CREATE TABLE IF NOT EXISTS "typeorm_metadata" ("type" varchar NOT NULL, "database" varchar, "schema" varchar, "table" varchar, "name" varchar, "value" text)`;

interface FrozenMigration {
  readonly timestamp: number;
  readonly migration: unknown;
}

/** The frozen SQLite migrations, oldest first. A migration class carries its 13 digit timestamp in its name. */
function frozenMigrations(): FrozenMigration[] {
  return sqliteFrozenTrack.migrations
    .filter((candidate): candidate is new () => unknown => typeof candidate === 'function')
    .map((migration) => ({ migration, timestamp: Number(/(\d{13})$/.exec(migration.name)?.[1]) }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Timestamp of the newest frozen SQLite migration (the last release before PostgreSQL). */
export const latestFrozenTimestamp = (): number => frozenMigrations().at(-1)?.timestamp as number;

/**
 * Creates the SQLite file as a release left it: the frozen track applied up to and including `timestamp` (the whole
 * track when omitted), so the schema is exactly what that release created. Returns the open connection; the caller
 * seeds data and destroys it.
 */
export async function migrateSqliteTo(file: string, timestamp?: number): Promise<DataSource> {
  const track = frozenMigrations().filter((entry) => timestamp === undefined || entry.timestamp <= timestamp);
  if (timestamp !== undefined && !track.some((entry) => entry.timestamp === timestamp)) {
    throw new Error(`No frozen SQLite migration has timestamp ${timestamp}`);
  }
  const source = createSqliteSource(file, {
    migrations: track.map((entry) => entry.migration),
    migrationsTableName: sqliteFrozenTrack.tableName,
  } as never);
  await source.initialize();
  await source.query(TYPEORM_METADATA);
  await source.runMigrations();
  return source;
}

let template: Promise<SqliteWorkspace> | undefined;

/** Copies a SQLite file migrated to the end of the frozen track (built once per test file) to `file`. */
export async function copyMigratedSqlite(file: string): Promise<void> {
  template ??= (async () => {
    const workspace = await createSqliteWorkspace();
    process.env.AUTH_SESSION_SECRET ||= 'sqlite-import-spec-secret';
    const source = await migrateSqliteTo(workspace.file);
    await source.destroy();
    return workspace;
  })();
  await copyFile((await template).file, file);
}

export async function disposeMigratedSqliteTemplate(): Promise<void> {
  const pending = template;
  template = undefined;
  if (pending) await (await pending).remove();
}

import type { DataSource } from 'typeorm';
import type { MigrationTrack } from '../backend/database-backend';
import * as migrations from '../migrations';
import { createSqliteSource } from './sqlite-source';

/**
 * The released SQLite migration track, frozen: its files are never changed (apps/api/src/database/migrations). It runs
 * on the private working copy of an old SQLite database during the SQLite -> PostgreSQL transfer, to bring a database
 * from any supported release to its final state before the data is exported. Nothing else uses it.
 */
export const sqliteFrozenTrack: MigrationTrack = {
  name: 'sqlite',
  tableName: 'migrations',
  directory: 'apps/api/src/database/migrations',
  migrations: Object.values(migrations),
};

/**
 * TypeORM records generated columns and views in this table. Databases created by a release that predates it
 * lack it, and the first migration writes into it.
 */
const TYPEORM_METADATA = `CREATE TABLE IF NOT EXISTS "typeorm_metadata" ("type" varchar NOT NULL, "database" varchar, "schema" varchar, "table" varchar, "name" varchar, "value" text)`;

/** Opens the SQLite file (a working copy) with the frozen track attached, without running anything. */
export async function openFrozenSqlite(file: string): Promise<DataSource> {
  const source = createSqliteSource(file, {
    migrations: [...sqliteFrozenTrack.migrations],
    migrationsTableName: sqliteFrozenTrack.tableName,
  } as never);
  await source.initialize();
  return source;
}

/** Applies every pending migration of the frozen track to the working copy. Returns the names that ran. */
export async function migrateFrozenSqlite(source: DataSource): Promise<string[]> {
  await source.query(TYPEORM_METADATA);
  const applied = await source.runMigrations();
  return applied.map((migration) => migration.name);
}

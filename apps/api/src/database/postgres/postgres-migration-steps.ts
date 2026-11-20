import type { MigrationInterface, QueryRunner } from 'typeorm';
import type { MigrationTrack } from '../backend/database-backend';
import { SnapshotIncompatibleError } from '../transfer-snapshot';

const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/** A core migration the target ran, with the bookkeeping row TypeORM keeps for it. */
export interface RecordedMigration {
  readonly timestamp: number;
  readonly name: string;
  readonly migration: MigrationInterface;
}

type MigrationClass = new () => MigrationInterface;

function isMigrationClass(candidate: unknown): candidate is MigrationClass {
  return (
    typeof candidate === 'function' &&
    typeof (candidate as { prototype?: MigrationInterface }).prototype?.up === 'function'
  );
}

/** The track's migrations by name; the index module may export helper constants beside the classes. */
function migrationsByName(track: MigrationTrack): Map<string, MigrationInterface> {
  const byName = new Map<string, MigrationInterface>();
  for (const candidate of track.migrations) {
    if (!isMigrationClass(candidate)) continue;
    const migration = new candidate();
    byName.set(migration.name ?? candidate.name, migration);
  }
  return byName;
}

/**
 * Takes the target's schema back to `baseline`: the migrations recorded after it are reverted, the latest first, and
 * their bookkeeping rows removed. Returns them in the order they ran, for `migrateUp`. Runs on the caller's
 * transaction, so a failure later in that transaction restores them with everything else.
 */
export async function migrateDownTo(
  runner: QueryRunner,
  track: MigrationTrack,
  baseline: string,
): Promise<RecordedMigration[]> {
  const rows: { timestamp: string; name: string }[] = await runner.query(
    `SELECT "timestamp"::text AS timestamp, "name" FROM ${quote(track.tableName)} ORDER BY "id"`,
  );
  const position = rows.findIndex((row) => row.name === baseline);
  if (position < 0) {
    throw new SnapshotIncompatibleError(`The database has not run the migration ${baseline} the import starts from`);
  }
  const known = migrationsByName(track);
  const later = rows.slice(position + 1).map((row): RecordedMigration => {
    const migration = known.get(row.name);
    if (!migration) {
      throw new SnapshotIncompatibleError(
        `The database ran the migration ${row.name}, which this release does not know; use the matching application version`,
      );
    }
    return { timestamp: Number(row.timestamp), name: row.name, migration };
  });
  for (const step of [...later].reverse()) {
    await step.migration.down(runner);
    await runner.query(`DELETE FROM ${quote(track.tableName)} WHERE "name" = $1`, [step.name]);
  }
  return later;
}

/** Applies `steps` again, in order, and records each one like TypeORM does. */
export async function migrateUp(runner: QueryRunner, track: MigrationTrack, steps: readonly RecordedMigration[]) {
  for (const step of steps) {
    await step.migration.up(runner);
    await runner.query(`INSERT INTO ${quote(track.tableName)} ("timestamp", "name") VALUES ($1, $2)`, [
      step.timestamp,
      step.name,
    ]);
  }
}

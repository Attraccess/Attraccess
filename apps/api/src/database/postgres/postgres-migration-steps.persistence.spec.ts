import type { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import type { MigrationTrack } from '../backend/database-backend';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { SnapshotIncompatibleError, type DatabaseSnapshot } from '../transfer-snapshot';
import { PostgresBaseline1760000000000 } from './migrations/1760000000000-baseline';
import { createPostgresTransfer } from './postgres-transfer';

jest.setTimeout(120_000);

const BASELINE = new PostgresBaseline1760000000000().name;

/** A migration after the baseline that transforms data, not only the schema. */
class ShoutingNames1795700000001 implements MigrationInterface {
  name = 'ShoutingNames1795700000001';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "user" ADD COLUMN "shout" text`);
    await runner.query(`UPDATE "user" SET "shout" = upper("username")`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "user" DROP COLUMN "shout"`);
  }
}

const track = (migrations: unknown[]): MigrationTrack => ({
  name: 'postgres',
  tableName: 'migrations',
  directory: 'test',
  migrations,
  foreignBaseline: BASELINE,
});
const TRACK = track([PostgresBaseline1760000000000, ShoutingNames1795700000001]);

const names = async (source: DataSource): Promise<string[]> =>
  (await source.query(`SELECT name FROM migrations ORDER BY id`)).map((row: { name: string }) => row.name);
const users = async (source: DataSource): Promise<{ username: string; shout: string | null }[]> =>
  source.query(`SELECT username, shout FROM "user" ORDER BY id`);

/** The data of an installation of the replaced engine: its schema is this track's baseline. */
async function foreignSnapshot(rows: string): Promise<DatabaseSnapshot> {
  const source = await createTestDataSource({ migrations: [PostgresBaseline1760000000000], migrationsRun: true });
  try {
    await source.query(`INSERT INTO "user" (id, username, email) VALUES ${rows}`);
    const snapshot = await createPostgresTransfer(track([PostgresBaseline1760000000000])).exportSnapshot(source);
    return { ...snapshot, backend: 'sqlite', core: { track: 'sqlite', migrations: [] } };
  } finally {
    await closeTestDataSource(source);
  }
}

describe('importing a snapshot of the replaced engine (persistence)', () => {
  let target: DataSource;

  beforeEach(async () => {
    target = await createTestDataSource({ migrations: [...TRACK.migrations], migrationsRun: true });
  });
  afterEach(() => closeTestDataSource(target));

  it('imports the data at the baseline and runs the later migrations on it', async () => {
    const snapshot = await foreignSnapshot(`(1, 'ada', 'ada@example.com'), (2, 'bob', 'bob@example.com')`);

    await createPostgresTransfer(TRACK).importSnapshot(target, snapshot);

    expect(await users(target)).toEqual([
      { username: 'ada', shout: 'ADA' },
      { username: 'bob', shout: 'BOB' },
    ]);
    expect(await names(target)).toEqual([BASELINE, 'ShoutingNames1795700000001']);
  });

  it('replaces data the target held, and a failed import leaves schema, bookkeeping and data as they were', async () => {
    await target.query(`INSERT INTO "user" (id, username, email) VALUES (7, 'eve', 'eve@example.com')`);
    await target.query(`UPDATE "user" SET shout = 'kept' WHERE id = 7`);
    const broken = await foreignSnapshot(`(1, 'ada', 'ada@example.com')`);
    const user = broken.tables.find((table) => table.name === 'user');
    // The same username twice breaks the unique constraint during the load, after the schema went back.
    const twice = {
      ...broken,
      tables: broken.tables.map((t) => (t === user ? { ...t, rows: [...t.rows, ...t.rows] } : t)),
    };

    await expect(createPostgresTransfer(TRACK).importSnapshot(target, twice)).rejects.toThrow();

    expect(await users(target)).toEqual([{ username: 'eve', shout: 'kept' }]);
    expect(await names(target)).toEqual([BASELINE, 'ShoutingNames1795700000001']);

    await createPostgresTransfer(TRACK).importSnapshot(target, broken);
    expect(await users(target)).toEqual([{ username: 'ada', shout: 'ADA' }]);
  });

  it('refuses a target that ran a migration this release does not know', async () => {
    await target.query(`INSERT INTO migrations ("timestamp", "name") VALUES (1799999999999, 'Future1799999999999')`);
    const snapshot = await foreignSnapshot(`(1, 'ada', 'ada@example.com')`);

    await expect(createPostgresTransfer(TRACK).importSnapshot(target, snapshot)).rejects.toThrow(
      new SnapshotIncompatibleError(
        'The database ran the migration Future1799999999999, which this release does not know; use the matching application version',
      ),
    );
    expect(await names(target)).toEqual([BASELINE, 'ShoutingNames1795700000001', 'Future1799999999999']);
  });

  it('refuses a snapshot of another engine on a track without a baseline for it', async () => {
    const snapshot = await foreignSnapshot(`(1, 'ada', 'ada@example.com')`);
    const withoutBaseline = { ...TRACK, foreignBaseline: undefined };

    await expect(createPostgresTransfer(withoutBaseline).importSnapshot(target, snapshot)).rejects.toThrow(
      'The "postgres" migration track imports no sqlite snapshot',
    );
  });
});

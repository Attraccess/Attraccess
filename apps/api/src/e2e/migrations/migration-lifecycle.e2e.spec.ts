import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveDatabaseBackend } from '../../database/backend';
import {
  assertForeignKeysClean,
  createLifecycleDatabase,
  migrate,
  recordedMigrations,
  releasedTrack,
  schemaSnapshot,
  trackUpTo,
  type LifecycleDatabase,
} from './fixtures/migration-lifecycle.test-fixture';
import { olderStates } from './fixtures/older-states.test-fixture';

jest.setTimeout(600_000);

const execFileAsync = promisify(execFile);
const SEED_SCRIPT = resolve(__dirname, '../../../scripts/seed-dev-user.mjs');
const track = releasedTrack();
const trackNames = track.map((entry) => entry.name);
// The last released migration is the version of the application under test.
const latestMigration = track[track.length - 1];

/** A migration that is newer than the whole released track and fails after it changed the schema and data. */
class LifecycleFailureProbe1999999999999 implements MigrationInterface {
  name = 'LifecycleFailureProbe1999999999999';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE lifecycle_probe (id integer PRIMARY KEY)');
    await queryRunner.query('UPDATE "user" SET username = username || \'-changed-by-failing-migration\'');
    throw new Error('lifecycle probe failed on purpose');
  }
  async down(): Promise<void> {
    return undefined;
  }
}

describe('Migration lifecycle on a real database (e2e)', () => {
  let lifecycle: LifecycleDatabase;

  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || 'e2e-migration-lifecycle-secret';
    lifecycle = await createLifecycleDatabase();
  });

  afterEach(async () => {
    await lifecycle.close();
  });

  describe('fresh install', () => {
    it('runs the whole released track once and records exactly the track in the track table', async () => {
      const source = await lifecycle.open(track.map((entry) => entry.migration));
      const applied = await migrate(source);

      expect(applied).toEqual(trackNames);
      expect(await recordedMigrations(source)).toEqual(trackNames);
      const rows: { timestamp: string | number; name: string }[] = await source.query(
        'SELECT timestamp, name FROM migrations ORDER BY id',
      );
      expect(rows.map((row) => Number(row.timestamp))).toEqual(track.map((entry) => entry.timestamp));
      expect(new Set(rows.map((row) => row.name)).size).toBe(rows.length);

      // The track's table keeps the name released databases already use.
      const tableName = resolveDatabaseBackend().migrationTrack.tableName;
      expect(tableName).toBe('migrations');
      expect(
        await source.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [tableName]),
      ).toHaveLength(1);
      await assertForeignKeysClean(source, 'after a fresh install');
    });

    it('is idempotent: a restart on a current database applies nothing and changes no schema', async () => {
      const source = await lifecycle.open(track.map((entry) => entry.migration));
      await migrate(source);
      const schema = await schemaSnapshot(source);

      const restarted = await lifecycle.open(track.map((entry) => entry.migration));
      expect(await migrate(restarted)).toEqual([]);
      expect(await recordedMigrations(restarted)).toEqual(trackNames);
      expect(await schemaSnapshot(restarted)).toEqual(schema);
    });

    it('creates the same schema as upgrading every older release step by step', async () => {
      const fresh = await lifecycle.open(track.map((entry) => entry.migration));
      await migrate(fresh);
      const freshSchema = await schemaSnapshot(fresh);

      const upgraded = await createLifecycleDatabase();
      try {
        for (const state of olderStates) {
          await migrate(await upgraded.open(trackUpTo(state.timestamp).map((entry) => entry.migration)));
        }
        const source = await upgraded.open(track.map((entry) => entry.migration));
        await migrate(source);
        expect(await schemaSnapshot(source)).toEqual(freshSchema);
      } finally {
        await upgraded.close();
      }
    });
  });

  describe.each(olderStates.map((state) => [state.name, state] as const))('upgrade from the %s', (_name, state) => {
    it('keeps the data and records only the migrations the old release lacked', async () => {
      const older = trackUpTo(state.timestamp);
      const old = await lifecycle.open(older.map((entry) => entry.migration));
      expect(await migrate(old)).toEqual(older.map((entry) => entry.name));
      await state.seed(old);
      await assertForeignKeysClean(old, 'in the seeded old release');

      const current = await lifecycle.open(track.map((entry) => entry.migration));
      const applied = await migrate(current);

      expect(applied).toEqual(trackNames.slice(older.length));
      expect(applied.length).toBeGreaterThan(0);
      expect(await recordedMigrations(current)).toEqual(trackNames);
      await state.verify(current);
      await assertForeignKeysClean(current, `after upgrading from ${state.name}`);
      expect(await migrate(current)).toEqual([]);
    });
  });

  describe('failure recovery', () => {
    const [, , release] = olderStates;

    it('rolls a failing upgrade back to the previous state and succeeds when the problem is gone', async () => {
      const older = trackUpTo(release.timestamp);
      const old = await lifecycle.open(older.map((entry) => entry.migration));
      await migrate(old);
      await release.seed(old);
      const schemaBefore = await schemaSnapshot(old);
      const recordedBefore = await recordedMigrations(old);
      expect(recordedBefore).toEqual(older.map((entry) => entry.name));

      // The pending batch (every newer released migration, then the failing one) runs in one transaction.
      const failing = await lifecycle.open([
        ...track.map((entry) => entry.migration),
        LifecycleFailureProbe1999999999999,
      ]);
      await expect(migrate(failing)).rejects.toThrow('lifecycle probe failed on purpose');

      const afterFailure = await lifecycle.open(older.map((entry) => entry.migration));
      expect(await recordedMigrations(afterFailure)).toEqual(recordedBefore);
      expect(await schemaSnapshot(afterFailure)).toEqual(schemaBefore);
      expect(await afterFailure.query("SELECT name FROM sqlite_master WHERE name = 'lifecycle_probe'")).toEqual([]);
      expect(await afterFailure.query('SELECT username FROM "user" ORDER BY id')).toEqual([
        { username: 'erin' },
        { username: 'frank' },
      ]);
      await assertForeignKeysClean(afterFailure, 'after the failed upgrade');

      const fixed = await lifecycle.open(track.map((entry) => entry.migration));
      expect(await migrate(fixed)).toEqual(trackNames.slice(older.length));
      expect(await recordedMigrations(fixed)).toEqual(trackNames);
      expect(await fixed.query("SELECT name FROM sqlite_master WHERE name = 'lifecycle_probe'")).toEqual([]);
      await release.verify(fixed);
    });

    it('records nothing and leaves no schema behind when the first batch on a fresh database fails', async () => {
      const failing = await lifecycle.open([latestMigration.migration, LifecycleFailureProbe1999999999999]);
      await expect(migrate(failing)).rejects.toThrow();
      const afterFailure = await lifecycle.open(track.map((entry) => entry.migration));
      // The migrations table exists, but no migration was recorded and nothing of the failed batch remains.
      expect(await recordedMigrations(afterFailure)).toEqual([]);
      expect(await afterFailure.query("SELECT name FROM sqlite_master WHERE name = 'lifecycle_probe'")).toEqual([]);
      expect(await migrate(afterFailure)).toEqual(trackNames);
    });
  });

  describe('seeding a fresh database', () => {
    const seed = (location: string, ...args: string[]) =>
      execFileAsync(process.execPath, [SEED_SCRIPT, '--db', location, '--allow-external-db', ...args], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_TYPE: 'sqlite' },
      });

    it('creates the administrator and the demo fixture on a freshly migrated database, idempotently', async () => {
      const source = await lifecycle.open(track.map((entry) => entry.migration));
      await migrate(source);

      await seed(lifecycle.database.location, '--demo', '--username', 'Admin', '--password', 'correct-horse');
      await seed(lifecycle.database.location, '--demo', '--username', 'admin', '--password', 'correct-horse');

      expect(await source.query('SELECT username, email, isEmailVerified, isDisabled FROM "user"')).toEqual([
        { username: 'admin', email: 'admin@local', isEmailVerified: 1, isDisabled: 0 },
      ]);
      const [{ password }] = await source.query(
        "SELECT password FROM authentication_detail WHERE type = 'local_password'",
      );
      expect(password).toMatch(/^\$2[aby]\$/);
      expect(
        await source.query(
          `SELECT r.key FROM user_role ur JOIN role r ON r.id = ur.roleId JOIN "user" u ON u.id = ur.userId
            WHERE u.username = 'admin' ORDER BY r.key`,
        ),
      ).toEqual([{ key: 'administrator' }, { key: 'demo-resource-user' }]);
      expect(await source.query('SELECT name, type FROM resource')).toEqual([
        { name: 'Demo 3D Printer', type: 'machine' },
      ]);
      expect(await source.query('SELECT name FROM resource_group')).toEqual([{ name: 'Demo Workshop' }]);
      // Seeding writes data only: the migration state is untouched.
      expect(await recordedMigrations(source)).toEqual(trackNames);
    });

    it('refuses an unsupported DATABASE_TYPE without touching the database', async () => {
      const source = await lifecycle.open(track.map((entry) => entry.migration));
      await migrate(source);
      const before = await source.query('SELECT COUNT(*) AS users FROM "user"');

      await expect(
        execFileAsync(process.execPath, [SEED_SCRIPT, '--db', lifecycle.database.location, '--allow-external-db'], {
          env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_TYPE: 'oracle' },
        }),
      ).rejects.toThrow(/Unsupported DATABASE_TYPE "oracle"/);
      expect(await source.query('SELECT COUNT(*) AS users FROM "user"')).toEqual(before);
    });
  });
});

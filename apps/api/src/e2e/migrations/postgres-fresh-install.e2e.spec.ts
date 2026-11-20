import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { compareSnapshots, rowCounts } from '../../database/transfer/snapshot-compare.test-fixture';
import { postgresBackend } from '../../database/postgres/postgres-backend';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { entitiesWithoutRows, seedAllEntities } from './fixtures/all-entities-seed.test-fixture';
import {
  createLifecycleDatabase,
  recordedMigrations,
  schemaSnapshot,
  trackMigrationNames,
  type LifecycleDatabase,
} from './fixtures/postgres-lifecycle.test-fixture';

jest.setTimeout(300_000);

const execFileAsync = promisify(execFile);
const SEED_SCRIPT = resolve(__dirname, '../../../scripts/seed-dev-user.mjs');
const trackNames = trackMigrationNames();

describe('Fresh PostgreSQL install (e2e)', () => {
  let lifecycle: LifecycleDatabase;

  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || 'e2e-postgres-lifecycle-secret';
    lifecycle = await createLifecycleDatabase();
  });

  afterEach(async () => {
    await lifecycle.close();
  });

  it('applies the baseline once and records exactly the PostgreSQL track in the track table', async () => {
    const source = await lifecycle.open();
    expect(await source.runMigrations().then((applied) => applied.map((migration) => migration.name))).toEqual(
      trackNames,
    );
    expect(await recordedMigrations(source)).toEqual(trackNames);
    expect(trackNames).toEqual(['PostgresBaseline1760000000000']);
    expect(postgresBackend.migrationTrack.tableName).toBe('migrations');
    const [{ count }] = await source.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'migrations'`,
    );
    expect(count).toBe(1);
    // The baseline seeds the defaults the application expects on first start.
    const [{ roles }] = await source.query('SELECT COUNT(*)::int AS roles FROM role');
    expect(roles).toBeGreaterThanOrEqual(6);
    expect(await source.query('SELECT 1 FROM "user" LIMIT 1')).toEqual([]);
  });

  it('is idempotent: a restart on a current database applies nothing and changes no schema', async () => {
    const source = await lifecycle.open();
    await source.runMigrations();
    const schema = await schemaSnapshot(source);
    expect(schema.length).toBeGreaterThan(100);

    const restarted = await lifecycle.open();
    expect(await restarted.runMigrations()).toEqual([]);
    expect(await recordedMigrations(restarted)).toEqual(trackNames);
    expect(await schemaSnapshot(restarted)).toEqual(schema);
  });

  it('creates the schema the entities describe: generating a migration would produce nothing', async () => {
    const source = await lifecycle.open();
    await source.runMigrations();
    const log = await source.driver.createSchemaBuilder().log();
    expect(log.upQueries.map((query) => query.query)).toEqual([]);
    expect(log.downQueries.map((query) => query.query)).toEqual([]);
  });

  describe('seeding', () => {
    const seed = (...args: string[]) =>
      execFileAsync(
        process.execPath,
        [SEED_SCRIPT, '--db', lifecycle.database.location, '--allow-external-db', ...args],
        {
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
        },
      );

    it('creates the administrator and the demo fixture on a freshly migrated database, idempotently', async () => {
      const source = await lifecycle.open();
      await source.runMigrations();

      await seed('--demo', '--username', 'Admin', '--password', 'correct-horse');
      await seed('--demo', '--username', 'admin', '--password', 'correct-horse');

      expect(await source.query('SELECT username, email, "isEmailVerified", "isDisabled" FROM "user"')).toEqual([
        { username: 'admin', email: 'admin@local', isEmailVerified: true, isDisabled: false },
      ]);
      const [{ password }] = await source.query(
        `SELECT password FROM authentication_detail WHERE type = 'local_password'`,
      );
      expect(password).toMatch(/^\$2[aby]\$/);
      expect(
        await source.query(
          `SELECT r.key FROM user_role ur JOIN role r ON r.id = ur."roleId" JOIN "user" u ON u.id = ur."userId"
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
  });

  describe('backup and restore of a fully populated database', () => {
    it('restores every entity into a second fresh database: the export of the copy equals the export of the original', async () => {
      const source = await lifecycle.open();
      await source.runMigrations();
      await seedAllEntities(source);
      expect(await entitiesWithoutRows(source)).toEqual([]);

      const snapshot = await postgresBackend.transfer.exportSnapshot(source);
      const copy = await createTestDataSource();
      try {
        await postgresBackend.transfer.importSnapshot(copy, snapshot);
        const restored = await postgresBackend.transfer.exportSnapshot(copy);
        // Engine bookkeeping (the migrations table, TypeORM's own metadata with the database name) is not data.
        expect(compareSnapshots(snapshot, restored)).toEqual([]);
        expect(restored.sequences).toEqual(snapshot.sequences);
        expect(rowCounts(restored)).toEqual(rowCounts(snapshot));
        expect(await copy.query('SELECT conname FROM pg_constraint WHERE NOT convalidated')).toEqual([]);
      } finally {
        await closeTestDataSource(copy);
      }
    });
  });
});

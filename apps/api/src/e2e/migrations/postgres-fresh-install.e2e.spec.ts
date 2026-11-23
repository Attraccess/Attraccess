import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { postgresBackend } from '../../database/postgres/postgres-backend';
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

  it('applies the track once and records exactly the PostgreSQL track in the track table', async () => {
    const source = await lifecycle.open();
    expect(await source.runMigrations().then((applied) => applied.map((migration) => migration.name))).toEqual(
      trackNames,
    );
    expect(await recordedMigrations(source)).toEqual(trackNames);
    expect(trackNames).toEqual([
      'PostgresBaseline1760000000000',
      'PostgresImportSqlite1760000000001',
      'PostgresGlobalForms1795700000000',
      'PostgresUserNames1796000000000',
      'AttractapNfcCapability1796100000000',
      'AttractapDropBridgeResourceLinks1796100000001',
      'SessionDurationLimits1796200000000',
      'SessionEndingSoonEmailTemplate1796200000001',
      'FormImages1796200000002',
      'RoleNetworkActions1796200000003',
      'ResourceListVisibility1796300000000',
      'PermittedResourceIndexes1796300000001',
      'NfcCardType1796300000002',
      'AttractapSecureConversion1796300000000',
    ]);
    expect(postgresBackend.migrationTrack.tableName).toBe('migrations');
    const [{ count }] = await source.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'migrations'`,
    );
    expect(count).toBe(1);
    // The baseline seeds the defaults the application expects on first start.
    const [{ roles }] = await source.query('SELECT COUNT(*)::int AS roles FROM role');
    expect(roles).toBeGreaterThanOrEqual(6);
    expect(await source.query('SELECT 1 FROM "user" LIMIT 1')).toEqual([]);
    // Without accounts the machine list visibility stays unset, which means "permitted-only" (ATT-843).
    expect(
      await source.query(`SELECT 1 FROM "setting" WHERE "parent" = 'resources' AND "key" = 'list_visibility'`),
    ).toEqual([]);
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

  describe('an existing database created before the SQLite import migration', () => {
    it('runs the import once as a no-op (no SQLite file) and keeps every row', async () => {
      const source = await lifecycle.open();
      await source.runMigrations();
      await seedAllEntities(source);
      expect(await entitiesWithoutRows(source)).toEqual([]);
      const tables = async () =>
        (await source.query(
          `SELECT table_name AS name FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`,
        )) as { name: string }[];
      const rowsBefore: Record<string, number> = {};
      for (const { name } of await tables()) {
        rowsBefore[name] = (await source.query(`SELECT COUNT(*)::int AS n FROM "${name}"`))[0].n;
      }
      // TypeORM runs a pending migration even when a later one is recorded already.
      await source.query(`DELETE FROM migrations WHERE name = 'PostgresImportSqlite1760000000001'`);

      const restarted = await lifecycle.open();
      expect((await restarted.runMigrations()).map((migration) => migration.name)).toEqual([
        'PostgresImportSqlite1760000000001',
      ]);
      expect((await recordedMigrations(restarted)).sort()).toEqual([...trackNames].sort());
      for (const [name, count] of Object.entries(rowsBefore)) {
        const [{ n }] = await restarted.query(`SELECT COUNT(*)::int AS n FROM "${name}"`);
        expect([name, n]).toEqual([name, count]);
      }
    });
  });
});

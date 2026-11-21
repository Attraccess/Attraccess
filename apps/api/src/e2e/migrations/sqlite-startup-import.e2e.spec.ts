import { Logger } from '@nestjs/common';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateDatabaseAtStartup } from '../../database/postgres/postgres-startup-migrations';
import { disposeMigratedSqliteTemplate } from '../../database/sqlite/sqlite-import.test-fixture';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
} from '../../test-utils/test-database';
import { olderStates } from './fixtures/older-states.test-fixture';
import { BOOKINGS_TABLE } from './fixtures/older-states-open-work.test-fixture';
import { recordedMigrations, trackMigrationNames } from './fixtures/postgres-lifecycle.test-fixture';
import { createOldInstallation, sha256, type OldInstallation } from './fixtures/sqlite-installation.test-fixture';

jest.setTimeout(600_000);

afterAll(disposeMigratedSqliteTemplate);

const stateNamed = (prefix: string) =>
  olderStates.find((state) => state.name.startsWith(prefix)) as (typeof olderStates)[number];

/**
 * The start of the application with a SQLite installation: migrateDatabaseAtStartup (before the license check, the
 * plugins and HTTP) with STORAGE_ROOT holding attraccess.sqlite and DATABASE_URL naming a blank PostgreSQL database.
 */
describe('startup with a SQLite installation (e2e)', () => {
  const saved = { ...process.env };
  let storageRoot: string;
  let database: TestDatabaseLocation;
  let installation: OldInstallation | undefined;
  let log: jest.SpyInstance;

  const sqliteFile = () => join(storageRoot, 'attraccess.sqlite');
  const filesInStorage = async () => (await readdir(storageRoot)).sort();
  async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const source = await createTestDataSource({ location: database.location });
    try {
      return await source.query(sql);
    } finally {
      await closeTestDataSource(source);
    }
  }
  const count = async (table: string): Promise<number> =>
    (await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "${table}"`))[0].n;
  const imports = () => log.mock.calls.filter(([message]) => String(message).startsWith('SQLite import complete'));

  /** Places the SQLite file of an older release in the storage root. */
  async function installSqlite(prefix: string): Promise<void> {
    installation = await createOldInstallation(stateNamed(prefix));
    await copyFile(installation.file, sqliteFile());
  }

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'attraccess-startup-import-'));
    database = await createTestDatabaseLocation({ empty: true });
    process.env.STORAGE_ROOT = storageRoot;
    process.env.DATABASE_URL = database.location;
    process.env.DATABASE_SSL = 'off';
    process.env.AUTH_SESSION_SECRET ||= 'e2e-startup-import-secret';
    delete process.env.DATABASE_TYPE;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    process.env = { ...saved };
    await installation?.remove();
    installation = undefined;
    await rm(storageRoot, { recursive: true, force: true });
    await database.remove();
  });

  it('moves the data, moves the SQLite file to the backup folder, and does nothing SQLite-related on the next start', async () => {
    await installSqlite('billing release');

    await migrateDatabaseAtStartup();

    expect(await filesInStorage()).toEqual(['sqlite-backup']);
    expect(await readdir(join(storageRoot, 'sqlite-backup'))).toEqual(['attraccess.sqlite']);
    expect(await count('user')).toBe(2);
    expect(await count('billing_transaction')).toBe(4);
    expect(imports()).toHaveLength(1);

    // Second start: no attraccess.sqlite any more, nothing happens; changes made in PostgreSQL stay.
    await query(`INSERT INTO "user" (username, email) VALUES ('later', 'later@example.com')`);
    await migrateDatabaseAtStartup();
    expect(await count('user')).toBe(3);
    expect(await filesInStorage()).toEqual(['sqlite-backup']);
    expect(imports()).toHaveLength(1);
  });

  it('does nothing SQLite-related without a SQLite file: a fresh installation gets the whole track', async () => {
    await migrateDatabaseAtStartup();

    expect(await filesInStorage()).toEqual([]);
    expect(imports()).toHaveLength(0);
    const source = await createTestDataSource({ location: database.location });
    try {
      expect(await recordedMigrations(source)).toEqual(trackMigrationNames());
    } finally {
      await closeTestDataSource(source);
    }
    expect(await count('user')).toBe(0);
  });

  it('stops the start when PostgreSQL already holds users and a SQLite file is present, and changes nothing', async () => {
    await migrateDatabaseAtStartup();
    await query(`INSERT INTO "user" (username, email) VALUES ('already-here', 'here@example.com')`);
    // The database predates the import migration: it is pending again.
    await query(`DELETE FROM migrations WHERE name = 'PostgresImportSqlite1760000000001'`);
    await installSqlite('billing release');
    const before = await sha256(sqliteFile());

    await expect(migrateDatabaseAtStartup()).rejects.toThrow(
      /already holds Attraccess data.*empty the PostgreSQL database.*move .*attraccess\.sqlite/s,
    );

    expect(await filesInStorage()).toEqual(['attraccess.sqlite']);
    expect(await sha256(sqliteFile())).toBe(before);
    expect(await count('user')).toBe(1);
    expect(imports()).toHaveLength(0);
  });

  it('imports exactly once when two instances start at the same time (migration lock)', async () => {
    await installSqlite('billing release');

    await Promise.all([migrateDatabaseAtStartup(), migrateDatabaseAtStartup()]);

    expect(await filesInStorage()).toEqual(['sqlite-backup']);
    expect(await count('user')).toBe(2);
    expect(await count('billing_transaction')).toBe(4);
    expect(imports()).toHaveLength(1);
  });

  it('leaves plugin data behind: plugins start with empty storage', async () => {
    await installSqlite('release with open work');

    await migrateDatabaseAtStartup();

    expect(await count('user')).toBe(2);
    expect(await query(`SELECT 1 FROM information_schema.tables WHERE table_name = '${BOOKINGS_TABLE}'`)).toEqual([]);
    expect(await filesInStorage()).toEqual(['sqlite-backup']);
  });
});

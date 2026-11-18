import { Logger } from '@nestjs/common';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresBackend } from '../../database/postgres/postgres-backend';
import { prepareDatabaseAtStartup } from '../../database/transfer/startup-transfer';
import { disposeMigratedSqliteTemplate } from '../../database/transfer/sqlite-import.test-fixture';
import { PluginMigrationService } from '../../plugin-system/plugin-migration.service';
import { PluginService } from '../../plugin-system/plugin.service';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
} from '../../test-utils/test-database';
import { olderStates } from './fixtures/older-states.test-fixture';
import { BOOKINGS_PLUGIN } from './fixtures/older-states-open-work.test-fixture';
import { createOldInstallation, sha256, type OldInstallation } from './fixtures/sqlite-transfer.test-fixture';

jest.setTimeout(600_000);

afterAll(disposeMigratedSqliteTemplate);

const stateNamed = (prefix: string) =>
  olderStates.find((state) => state.name.startsWith(prefix)) as (typeof olderStates)[number];

const MIGRATED = /^attraccess\.sqlite\.migrated-to-postgres-\d{8}T\d{6}Z$/;

/**
 * The start of the application with a SQLite installation: prepareDatabaseAtStartup (before migrations serve, before
 * plugins, before HTTP) with STORAGE_ROOT holding attraccess.sqlite and DATABASE_URL naming a fresh PostgreSQL database.
 */
describe('startup transfer of a SQLite installation (e2e)', () => {
  const saved = { ...process.env };
  let storageRoot: string;
  let database: TestDatabaseLocation;
  let installation: OldInstallation;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  const sqliteFile = () => join(storageRoot, 'attraccess.sqlite');
  const filesInStorage = async () => (await readdir(storageRoot)).sort();
  const count = async (table: string): Promise<number> => {
    const source = await createTestDataSource({ location: database.location });
    try {
      return (await source.query(`SELECT COUNT(*)::int AS n FROM "${table}"`))[0].n;
    } finally {
      await closeTestDataSource(source);
    }
  };

  /** Places the SQLite file of an older release in the storage root. */
  async function installSqlite(prefix: string): Promise<void> {
    installation = await createOldInstallation(stateNamed(prefix));
    await copyFile(installation.workspace.file, sqliteFile());
  }

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'attraccess-startup-transfer-'));
    database = await createTestDatabaseLocation({ empty: true });
    process.env.STORAGE_ROOT = storageRoot;
    process.env.DATABASE_URL = database.location;
    process.env.DATABASE_SSL = 'off';
    process.env.AUTH_SESSION_SECRET ||= 'e2e-startup-transfer-secret';
    delete process.env.DATABASE_TYPE;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    log.mockRestore();
    jest.restoreAllMocks();
    process.env = { ...saved };
    await installation?.workspace.remove();
    await rm(storageRoot, { recursive: true, force: true });
    await database.remove();
  });

  const transfers = () =>
    log.mock.calls.filter(([message]) => String(message).includes('SQLite -> PostgreSQL transfer complete'));

  it('moves the data, renames the SQLite file, and does not transfer again on the second boot', async () => {
    await installSqlite('billing release');
    const sourceSha = await sha256(sqliteFile());

    await prepareDatabaseAtStartup();

    const files = await filesInStorage();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(MIGRATED);
    // The renamed file is the original, byte for byte.
    expect(await sha256(join(storageRoot, files[0]))).toBe(sourceSha);
    expect(await count('user')).toBe(2);
    expect(await count('billing_transaction')).toBe(4);
    expect(transfers()).toHaveLength(1);

    // Second boot: no attraccess.sqlite any more, nothing happens; changes made in PostgreSQL stay.
    const source = await createTestDataSource({ location: database.location });
    await source.query(`INSERT INTO "user" (username, email) VALUES ('later', 'later@example.com')`);
    await closeTestDataSource(source);
    await prepareDatabaseAtStartup();
    expect(await count('user')).toBe(3);
    expect(await filesInStorage()).toEqual(files);
    expect(transfers()).toHaveLength(1);
  });

  it('does nothing when there is no SQLite file: a fresh installation starts on an empty PostgreSQL database', async () => {
    await prepareDatabaseAtStartup();
    expect(await filesInStorage()).toEqual([]);
    expect(transfers()).toHaveLength(0);
  });

  it('warns and transfers nothing when PostgreSQL already holds data and a SQLite file is present', async () => {
    await installSqlite('billing release');
    const sourceSha = await sha256(sqliteFile());
    const existing = await createTestDataSource({ location: database.location, migrationsRun: false });
    await existing.runMigrations();
    await existing.query(`INSERT INTO "user" (username, email) VALUES ('already-here', 'here@example.com')`);
    await closeTestDataSource(existing);

    await prepareDatabaseAtStartup();

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/already holds data.*not transferred/s));
    expect(await filesInStorage()).toEqual(['attraccess.sqlite']);
    expect(await sha256(sqliteFile())).toBe(sourceSha);
    expect(await count('user')).toBe(1);
    expect(transfers()).toHaveLength(0);
  });

  it('transfers exactly once when two instances start at the same time (advisory lock)', async () => {
    await installSqlite('billing release');

    await Promise.all([prepareDatabaseAtStartup(), prepareDatabaseAtStartup()]);

    const files = await filesInStorage();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(MIGRATED);
    expect(await count('user')).toBe(2);
    expect(await count('billing_transaction')).toBe(4);
    expect(transfers()).toHaveLength(1);
  });

  it('refuses a SQLite file with plugin data when the plugin is not installed, and changes nothing', async () => {
    await installSqlite('release with open work');
    const sourceSha = await sha256(sqliteFile());

    await expect(prepareDatabaseAtStartup()).rejects.toThrow(/plugin that is not installed or not loadable/);

    expect(await filesInStorage()).toEqual(['attraccess.sqlite']);
    expect(await sha256(sqliteFile())).toBe(sourceSha);
    expect(await count('user')).toBe(0);
    expect(await count('resource_usage')).toBe(0);
    expect(transfers()).toHaveLength(0);
  });

  it('moves the data of an installed plugin together with the core data', async () => {
    await installSqlite('release with open work');
    const [descriptor] = installation.plugins;
    jest
      .spyOn(PluginService, 'getPlugins')
      .mockReturnValue([{ name: BOOKINGS_PLUGIN.id, version: BOOKINGS_PLUGIN.version } as never]);
    jest.spyOn(PluginMigrationService, 'hasStorage').mockReturnValue(true);
    jest.spyOn(PluginMigrationService, 'loadStorage').mockReturnValue(descriptor.storage);

    await prepareDatabaseAtStartup();

    expect((await filesInStorage())[0]).toMatch(MIGRATED);
    expect(await count('plugin_bookings_booking')).toBe(1);
    expect(await count('user')).toBe(2);
    expect(postgresBackend.type).toBe('postgres');
  });
});

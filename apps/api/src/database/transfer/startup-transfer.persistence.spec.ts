import { Logger } from '@nestjs/common';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginService } from '../../plugin-system/plugin.service';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
} from '../../test-utils/test-database';
import { createSqliteWorkspace, migrateSqliteTo, type SqliteWorkspace } from './sqlite-import.test-fixture';
import { postgresMigrations } from '../postgres/migrations';
import { prepareDatabaseAtStartup, runTransfer } from './startup-transfer';
import { IDLE_API_WARNING } from './replace-target';
import { SqliteTransferError } from './transfer-errors';

jest.setTimeout(300_000);

describe('runTransfer (persistence)', () => {
  const saved = { ...process.env };
  let template: SqliteWorkspace;
  let storageRoot: string;
  let database: TestDatabaseLocation;
  let warn: jest.SpyInstance;

  const sqliteFile = () => join(storageRoot, 'attraccess.sqlite');
  const files = async () => (await readdir(storageRoot)).sort();
  const query = async <T>(sql: string): Promise<T[]> => {
    const source = await createTestDataSource({ location: database.location, migrationsRun: false });
    try {
      return await source.query(sql);
    } finally {
      await closeTestDataSource(source);
    }
  };
  const usernames = async () =>
    (await query<{ username: string }>(`SELECT username FROM "user" ORDER BY id`)).map((row) => row.username);

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET ||= 'startup-transfer-spec-secret';
    template = await createSqliteWorkspace();
    const source = await migrateSqliteTo(template.file);
    await source.query(`INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`);
    await source.destroy();
  });
  afterAll(() => template.remove());

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'attraccess-run-transfer-'));
    database = await createTestDatabaseLocation({ empty: true });
    process.env.STORAGE_ROOT = storageRoot;
    process.env.DATABASE_URL = database.location;
    process.env.DATABASE_SSL = 'off';
    delete process.env.DATABASE_TYPE;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(PluginService, 'getPlugins').mockReturnValue([]);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    process.env = { ...saved };
    await rm(storageRoot, { recursive: true, force: true });
    await database.remove();
  });

  const installSqlite = () => copyFile(template.file, sqliteFile());
  /** PostgreSQL that already holds an Attraccess user. */
  const fillTarget = async () => {
    const source = await createTestDataSource({ location: database.location, migrationsRun: false });
    await source.runMigrations();
    await source.query(`INSERT INTO "user" (id, username, email) VALUES (9, 'resident', 'resident@example.com')`);
    await closeTestDataSource(source);
  };

  it('applies the core migrations once when two instances start together on a fresh database', async () => {
    await Promise.all([prepareDatabaseAtStartup(), prepareDatabaseAtStartup()]);

    const applied = await query<{ name: string }>(`SELECT name FROM migrations ORDER BY id`);
    expect(applied.map((row) => row.name)).toEqual(postgresMigrations.map((migration) => migration.name));
    expect(await files()).toEqual([]);
  });

  it('applies the core migrations and transfers once when two instances start together with a SQLite file', async () => {
    await installSqlite();

    await Promise.all([prepareDatabaseAtStartup(), prepareDatabaseAtStartup()]);

    expect(await usernames()).toEqual(['ada']);
    expect(await files()).toEqual([expect.stringMatching(/^attraccess\.sqlite\.migrated-to-postgres-/)]);
  });

  it('stops the start when the storage directory cannot be read, instead of starting without the SQLite data', async () => {
    const storage = join(storageRoot, 'locked');
    await mkdir(storage);
    process.env.STORAGE_ROOT = storage;
    await chmod(storage, 0o000);
    try {
      const error = await prepareDatabaseAtStartup().catch((e) => e);
      expect(error).toBeInstanceOf(SqliteTransferError);
      expect(error.message).toContain(
        `failed while looking for the SQLite file: cannot tell whether ${join(storage, 'attraccess.sqlite')} ` +
          'exists (EACCES); make the storage directory readable by the API. Nothing was changed',
      );
      expect(error.message).not.toContain('attraccess@');
    } finally {
      await chmod(storage, 0o700);
    }
    // Nothing was applied: the check runs before the migrations.
    expect(await query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations'`)).toEqual([]);
  });

  it('does nothing when SKIP_DATABASE_MIGRATIONS=true', async () => {
    process.env.SKIP_DATABASE_MIGRATIONS = 'true';
    await installSqlite();
    await prepareDatabaseAtStartup();
    expect(await query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations'`)).toEqual([]);
    expect(await files()).toEqual(['attraccess.sqlite']);
  });

  it('returns false without touching anything when the SQLite file is gone', async () => {
    await expect(runTransfer({ sqliteFile: sqliteFile(), whenTargetHasData: 'skip' })).resolves.toBe(false);
    expect(await files()).toEqual([]);
  });

  it('transfers into an empty database and renames the file', async () => {
    await installSqlite();
    await expect(runTransfer({ sqliteFile: sqliteFile(), whenTargetHasData: 'refuse' })).resolves.toBe(true);
    expect(await usernames()).toEqual(['ada']);
    expect(await files()).toEqual([expect.stringMatching(/^attraccess\.sqlite\.migrated-to-postgres-/)]);
  });

  it('keeps the file name with keepFile', async () => {
    await installSqlite();
    await expect(runTransfer({ sqliteFile: sqliteFile(), whenTargetHasData: 'skip', keepFile: true })).resolves.toBe(
      true,
    );
    expect(await files()).toEqual(['attraccess.sqlite']);
  });

  it('skips with a warning when the target holds data', async () => {
    await installSqlite();
    await fillTarget();
    await expect(runTransfer({ sqliteFile: sqliteFile(), whenTargetHasData: 'skip' })).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/already holds data.*not transferred/s));
    expect(await usernames()).toEqual(['resident']);
    expect(await files()).toEqual(['attraccess.sqlite']);
  });

  it('refuses with an error naming --force when the target holds data', async () => {
    await installSqlite();
    await fillTarget();
    const error = await runTransfer({ sqliteFile: sqliteFile(), whenTargetHasData: 'refuse' }).catch((e) => e);
    expect(error).toBeInstanceOf(SqliteTransferError);
    expect(error.message).toContain('pass --force');
    expect(await usernames()).toEqual(['resident']);
    expect(await files()).toEqual(['attraccess.sqlite']);
  });

  it('replaces what the target holds when asked to, naming every table it empties first', async () => {
    await installSqlite();
    await fillTarget();
    await expect(runTransfer({ sqliteFile: sqliteFile(), whenTargetHasData: 'replace' })).resolves.toBe(true);
    expect(await usernames()).toEqual(['ada']);
    const warned = warn.mock.calls.map(([message]) => String(message));
    expect(warned).toContain(IDLE_API_WARNING);
    const listed = warned.find((m) => m.startsWith('--force: deleting'));
    expect(listed).toMatch(/^--force: deleting the content of \d+ table\(s\) of the PostgreSQL database/);
    expect(listed).toContain('audit_log');
    expect(listed).toMatch(/\buser\b/);
    expect(listed).not.toMatch(/\bmigrations\b|typeorm_metadata/);
  });

  it('refuses to replace the data while a running API is connected to the database', async () => {
    await installSqlite();
    await fillTarget();
    // A connection like the API's own (same application_name).
    const api = await createTestDataSource({ location: database.location, migrationsRun: false });
    try {
      const error = await runTransfer({ sqliteFile: sqliteFile(), whenTargetHasData: 'replace' }).catch((e) => e);
      expect(error).toBeInstanceOf(SqliteTransferError);
      expect(error.outcome).toBe('refused');
      expect(error.message).toMatch(
        /connection\(s\) of a running Attraccess API use the PostgreSQL database right now/,
      );
    } finally {
      await closeTestDataSource(api);
    }
    expect(await usernames()).toEqual(['resident']);
    expect(await files()).toEqual(['attraccess.sqlite']);
  });
});

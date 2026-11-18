import { Logger } from '@nestjs/common';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
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
import { runTransfer } from './startup-transfer';
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

  it('replaces what the target holds when asked to', async () => {
    await installSqlite();
    await fillTarget();
    await expect(runTransfer({ sqliteFile: sqliteFile(), whenTargetHasData: 'replace' })).resolves.toBe(true);
    expect(await usernames()).toEqual(['ada']);
  });
});

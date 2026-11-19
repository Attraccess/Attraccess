import Database from 'better-sqlite3';
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DataSource } from 'typeorm';
import {
  createPostgresTarget,
  sha256,
  type PostgresTarget,
} from '../../e2e/migrations/fixtures/sqlite-transfer.test-fixture';
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { postgresBackend } from '../postgres/postgres-backend';
import * as postgresTransfer from '../postgres/postgres-transfer';
import type { PluginDescriptor } from '../transfer-snapshot';
import { createSqliteWorkspace, migrateSqliteTo, type SqliteWorkspace } from './sqlite-import.test-fixture';
import { exportSqliteSnapshot, transferSqliteToPostgres } from './sqlite-to-postgres';
import { SqliteTransferError } from './transfer-errors';

jest.setTimeout(300_000);

const entry = table({ id: f.id(), note: f.text().optional() });
const storage = compilePluginStorage(
  'ledger',
  definePluginStorage({
    tables: { entry },
    migrations: [{ version: 1, name: 'entries', steps: [step.createTable('entry', entry)] }],
  }),
  { reservedTables: postgresBackend.plugins.coreTableNames() },
);
const PLUGIN: PluginDescriptor = { id: 'ledger', version: '1.0.0', storage };

describe('SQLite -> PostgreSQL transfer (persistence)', () => {
  let template: SqliteWorkspace;
  let workspace: SqliteWorkspace;
  let target: PostgresTarget;
  const warnings: string[] = [];
  const logs: string[] = [];
  const logger = { log: (m: string) => logs.push(m), warn: (m: string) => warnings.push(m) };

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET ||= 'sqlite-to-postgres-spec-secret';
    template = await createSqliteWorkspace();
    const source = await migrateSqliteTo(template.file);
    await source.query(
      `INSERT INTO "user" (id, username, email, creditBalance) VALUES (1, 'ada', 'ada@example.com', 5), (2, 'bob', 'bob@example.com', 0)`,
    );
    await source.destroy();
  });
  afterAll(() => template.remove());

  beforeEach(async () => {
    warnings.length = 0;
    logs.length = 0;
    workspace = await createSqliteWorkspace();
    await copyFile(template.file, workspace.file);
    target = await createPostgresTarget();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await target.close();
    await workspace.remove();
  });

  const run = (overrides: Partial<Parameters<typeof transferSqliteToPostgres>[0]> = {}) =>
    transferSqliteToPostgres({
      sqliteFile: workspace.file,
      target: target.source,
      plugins: [],
      targetPluginEngine: { migrate: jest.fn() } as never,
      logger,
      ...overrides,
    });
  const usernames = async (db: DataSource) =>
    (await db.query(`SELECT username FROM "user" ORDER BY id`)).map((row: { username: string }) => row.username);

  it('moves the data and renames the SQLite file with the timestamp of the moment, keeping its bytes', async () => {
    const before = await sha256(workspace.file);

    const summary = await run({ now: () => new Date('2026-05-06T07:08:09.123Z') });

    expect(await usernames(target.source)).toEqual(['ada', 'bob']);
    expect(summary.renamedTo).toBe(`${workspace.file}.migrated-to-postgres-20260506T070809Z`);
    expect(await readdir(dirname(workspace.file))).toEqual(['attraccess.sqlite.migrated-to-postgres-20260506T070809Z']);
    expect(await sha256(summary.renamedTo as string)).toBe(before);
    expect(summary.tables.user).toBe(2);
    expect(summary.totalRows).toBeGreaterThanOrEqual(2);
    expect(summary.plugins).toEqual([]);
    expect(logs.some((line) => line.includes('SQLite -> PostgreSQL transfer complete'))).toBe(true);
    expect(logs.some((line) => line.includes('was kept as'))).toBe(true);
  });

  it('leaves the SQLite file in place with markMigrated=false and reports derived data that disagrees', async () => {
    const before = await sha256(workspace.file);

    const summary = await run({ markMigrated: false });

    expect(summary.renamedTo).toBeUndefined();
    expect(await readdir(dirname(workspace.file))).toEqual(['attraccess.sqlite']);
    expect(await sha256(workspace.file)).toBe(before);
    // ada has a balance of 5 without a completed transaction: reported, not repaired.
    expect(summary.warnings).toEqual([expect.stringContaining('balance of user 1 is 5')]);
    expect(warnings).toEqual([expect.stringMatching(/^Integrity check: balance of user 1/)]);
  });

  it('migrates the storage of an installed plugin on both sides and reports it', async () => {
    const summary = await run({
      plugins: [PLUGIN],
      targetPluginEngine: postgresBackend.plugins.createMigrationEngine({
        type: 'postgres',
        url: (target.source.options as { url: string }).url,
      } as never),
      markMigrated: false,
    });
    expect(summary.plugins).toEqual(['ledger']);
    expect(await target.source.query(`SELECT COUNT(*)::int AS n FROM "plugin_ledger_entry"`)).toEqual([{ n: 0 }]);
  });

  it("leaves an installed plugin's 1.x migrations table behind: the storage bookkeeping replaces it", async () => {
    const sqlite = new Database(workspace.file);
    sqlite.exec(
      `CREATE TABLE "plugin_migrations_ledger" ("id" integer PRIMARY KEY AUTOINCREMENT, "timestamp" bigint NOT NULL, "name" varchar NOT NULL)`,
    );
    sqlite.close();
    const url = (target.source.options as { url: string }).url;

    const summary = await run({
      plugins: [PLUGIN],
      targetPluginEngine: postgresBackend.plugins.createMigrationEngine({ type: 'postgres', url } as never),
      markMigrated: false,
    });

    expect(summary.plugins).toEqual(['ledger']);
    expect(await postgresTransfer.userTables(target.source)).not.toContain('plugin_migrations_ledger');
    expect(await postgresTransfer.appliedStorageVersions(target.source, storage.namespace)).toEqual([1]);
  });

  it('fails without touching the SQLite file when the target does not fit, and says in which step', async () => {
    const bare = await createPostgresTargetWithoutSchema();
    const before = await sha256(workspace.file);
    try {
      const error = await run({ target: bare.source }).catch((e) => e);
      expect(error).toBeInstanceOf(SqliteTransferError);
      expect(error.step).toBe('importing into PostgreSQL');
      expect(error.message).toContain('The SQLite file is untouched');
    } finally {
      await bare.close();
    }
    expect(await readdir(dirname(workspace.file))).toEqual(['attraccess.sqlite']);
    expect(await sha256(workspace.file)).toBe(before);
    expect(await usernames(target.source)).toEqual([]);
  });

  it('fails when a plugin cannot prepare its target storage, importing nothing', async () => {
    const failing = { migrate: jest.fn().mockRejectedValue(new Error('no space left')) };
    const error = await run({ plugins: [PLUGIN], targetPluginEngine: failing as never }).catch((e) => e);
    expect(error).toBeInstanceOf(SqliteTransferError);
    expect(error.message).toContain('no space left');
    expect(await usernames(target.source)).toEqual([]);
    expect(await readdir(dirname(workspace.file))).toEqual(['attraccess.sqlite']);
  });

  it('keeps the transfer when the rename fails after the commit, and says what to do with the file', async () => {
    const now = new Date('2026-05-06T07:08:09Z');
    const occupied = `${workspace.file}.migrated-to-postgres-20260506T070809Z`;
    await writeFile(occupied, 'an earlier copy');

    const summary = await run({ now: () => now });

    expect(await usernames(target.source)).toEqual(['ada', 'bob']);
    expect(summary.renamedTo).toBeUndefined();
    const expected =
      `The data was transferred to PostgreSQL, but renaming ${workspace.file} failed: ${occupied} already exists; ` +
      'the SQLite file was not renamed. Rename or remove the SQLite file (and its -journal, -wal and -shm files) ' +
      'yourself; it will be ignored on the next start because PostgreSQL now holds the data.';
    expect(warnings).toContain(expected);
    expect(summary.warnings).toContain(expected);
    expect((await readdir(dirname(workspace.file))).sort()).toEqual([
      'attraccess.sqlite',
      'attraccess.sqlite.migrated-to-postgres-20260506T070809Z',
    ]);
  });

  it('keeps the transfer when the integrity check after the commit cannot run, and warns', async () => {
    jest.spyOn(postgresTransfer, 'postgresIntegrityViolations').mockRejectedValueOnce(new Error('connection reset'));

    const summary = await run({ markMigrated: false });

    expect(await usernames(target.source)).toEqual(['ada', 'bob']);
    expect(summary.warnings).toEqual([
      'The data was transferred to PostgreSQL, but the integrity check after the import could not run: ' +
        'connection reset. Compare the credit balances of the users with their transactions.',
    ]);
    expect(warnings).toEqual(summary.warnings);
  });

  it('says that prepared plugin tables stay after a failed import, and a retry reuses them', async () => {
    const url = (target.source.options as { url: string }).url;
    const engine = postgresBackend.plugins.createMigrationEngine({ type: 'postgres', url } as never);
    await target.source.query(`ALTER TABLE "user" ADD CONSTRAINT refuse_bob CHECK (username <> 'bob')`);

    const error = await run({ plugins: [PLUGIN], targetPluginEngine: engine, markMigrated: false }).catch((e) => e);

    expect(error).toBeInstanceOf(SqliteTransferError);
    expect(error.step).toBe('importing into PostgreSQL');
    expect(error.outcome).toBe('plugin-storage-kept');
    expect(error.message).toContain(
      'no data was imported into PostgreSQL; the empty storage tables of installed plugins may already exist there ' +
        'and are reused when the transfer runs again; the next start retries',
    );
    expect(await usernames(target.source)).toEqual([]);
    expect(await postgresTransfer.appliedStorageVersions(target.source, storage.namespace)).toEqual([1]);

    await target.source.query(`ALTER TABLE "user" DROP CONSTRAINT refuse_bob`);
    const summary = await run({ plugins: [PLUGIN], targetPluginEngine: engine, markMigrated: false });

    expect(summary.plugins).toEqual(['ledger']);
    expect(await usernames(target.source)).toEqual(['ada', 'bob']);
    expect(await postgresTransfer.appliedStorageVersions(target.source, storage.namespace)).toEqual([1]);
  });

  it('rolls back the hot journal a killed 1.x container left, on the working copy only', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'attraccess-hot-journal-'));
    try {
      const live = join(staging, 'attraccess.sqlite');
      await copyFile(template.file, live);
      // A 1.x write transaction (rollback journal, no WAL) whose pages already reached the database file when the
      // container was killed: the copies of the database and its journal are taken while it is still open.
      const db = new Database(live);
      db.pragma('journal_mode = DELETE');
      db.pragma('cache_size = 1');
      db.exec('BEGIN');
      db.exec(`DELETE FROM "user"`);
      const insert = db.prepare(`INSERT INTO "user" (username, email) VALUES (?, ?)`);
      for (let index = 0; index < 500; index++) insert.run(`torn-${index}-${'x'.repeat(200)}`, `t${index}@example.com`);
      await copyFile(live, workspace.file);
      await copyFile(`${live}-journal`, `${workspace.file}-journal`);
      db.exec('ROLLBACK');
      db.close();
      expect(await sha256(workspace.file)).not.toBe(await sha256(template.file));
      const original = await sha256(workspace.file);
      const journal = await sha256(`${workspace.file}-journal`);

      const snapshot = await exportSqliteSnapshot(workspace.file, [], logger);

      const users = snapshot.tables.find((table) => table.name === 'user');
      const username = users?.columns.findIndex((column) => column.name === 'username') as number;
      expect(users?.rows.map((row) => row[username])).toEqual(['ada', 'bob']);
      expect(await sha256(workspace.file)).toBe(original);
      expect(await sha256(`${workspace.file}-journal`)).toBe(journal);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  });

  it('fails on a SQLite file that does not exist', async () => {
    const error = await run({ sqliteFile: `${workspace.file}.missing` }).catch((e) => e);
    expect(error).toBeInstanceOf(SqliteTransferError);
    expect(error.step).toBe('copying the SQLite file');
  });
});

async function createPostgresTargetWithoutSchema() {
  const { createTestDataSource, closeTestDataSource } = await import('../../test-utils/test-database');
  const source = await createTestDataSource({ empty: true });
  return { source, close: () => closeTestDataSource(source) };
}

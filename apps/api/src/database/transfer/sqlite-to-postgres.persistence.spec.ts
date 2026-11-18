import { copyFile, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DataSource } from 'typeorm';
import {
  createPostgresTarget,
  sha256,
  type PostgresTarget,
} from '../../e2e/migrations/fixtures/sqlite-transfer.test-fixture';
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { postgresBackend } from '../postgres/postgres-backend';
import type { PluginDescriptor } from '../transfer-snapshot';
import { createSqliteWorkspace, migrateSqliteTo, type SqliteWorkspace } from './sqlite-import.test-fixture';
import { transferSqliteToPostgres } from './sqlite-to-postgres';
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

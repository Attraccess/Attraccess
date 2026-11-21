import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { createSqliteSource } from '../../sqlite/sqlite-source';
import {
  copyMigratedSqlite,
  disposeMigratedSqliteTemplate,
  frozenTimestamps,
  migrateSqliteTo,
} from '../../sqlite/sqlite-import.test-fixture';
import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { PostgresImportSqlite1760000000001 } from './1760000000001-import-sqlite';
import { importSqliteInstallation, type ImportLog } from './sqlite-import/import-sqlite';

jest.setTimeout(120_000);

afterAll(disposeMigratedSqliteTemplate);

const sha256 = async (file: string) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');

/** The import of a SQLite installation into a PostgreSQL database at the baseline. */
describe('PostgresImportSqlite1760000000001', () => {
  let pg: DataSource;
  let storageRoot: string;
  let sqliteFile: string;
  let logger: ImportLog & { [K in keyof ImportLog]: jest.Mock };

  /** Writes rows into the SQLite file (already at the last SQLite migration). */
  async function sqlite(...statements: (string | [string, unknown[]])[]): Promise<void> {
    const source = createSqliteSource(sqliteFile);
    await source.initialize();
    try {
      for (const statement of statements) {
        if (typeof statement === 'string') await source.query(statement);
        else await source.query(statement[0], statement[1]);
      }
    } finally {
      await source.destroy();
    }
  }

  async function runImport(): Promise<void> {
    const runner = pg.createQueryRunner();
    try {
      await importSqliteInstallation(runner, { sqliteFile, logger, now: () => new Date('2026-11-21T09:30:00.123Z') });
    } finally {
      await runner.release();
    }
  }

  const q = <T = Record<string, unknown>>(sql: string): Promise<T[]> => pg.query(sql);

  /** User triggers left disabled: none may remain after an import, whether it committed or not. */
  const disabledTriggers = () => q(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'D'`);
  const foreignKeyCount = async () =>
    Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM pg_constraint WHERE contype = 'f'`))[0].n);

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'attraccess-sqlite-import-'));
    sqliteFile = join(storageRoot, 'attraccess.sqlite');
    logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    pg = await createTestDataSource({ empty: true, migrations: [PostgresBaseline1760000000000] });
    await pg.runMigrations();
  });

  afterEach(async () => {
    await closeTestDataSource(pg);
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('does nothing without a SQLite file', async () => {
    const roles = await q('SELECT key FROM role ORDER BY key');
    await runImport();
    expect(await q('SELECT key FROM role ORDER BY key')).toEqual(roles);
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(`No SQLite file at ${sqliteFile}: nothing to import.`);
  });

  it('runs inside the track as a migration that owns its transaction and resolves the file under STORAGE_ROOT', async () => {
    const migration = new PostgresImportSqlite1760000000001();
    expect(migration.transaction).toBe(false);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const saved = process.env.STORAGE_ROOT;
    process.env.STORAGE_ROOT = storageRoot;
    try {
      await copyMigratedSqlite(sqliteFile);
      await sqlite(`INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`);
      const runner = pg.createQueryRunner();
      try {
        await migration.up(runner);
      } finally {
        await runner.release();
      }
    } finally {
      if (saved === undefined) delete process.env.STORAGE_ROOT;
      else process.env.STORAGE_ROOT = saved;
    }
    expect(await q('SELECT username FROM "user"')).toEqual([{ username: 'ada' }]);
    expect(await readdir(storageRoot)).toEqual(['sqlite-backup']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SQLite import complete'));
    log.mockRestore();
  });

  describe('with a SQLite file', () => {
    beforeEach(async () => {
      await copyMigratedSqlite(sqliteFile);
    });

    it('refuses a PostgreSQL database that already holds users, and changes nothing', async () => {
      // A file one SQLite migration behind: a refused import must not migrate it either.
      await rm(sqliteFile);
      await (await migrateSqliteTo(sqliteFile, frozenTimestamps().at(-2))).destroy();
      await pg.query(`INSERT INTO "user" (username, email) VALUES ('here', 'here@example.com')`);
      const before = await sha256(sqliteFile);

      await expect(runImport()).rejects.toThrow(
        /already holds Attraccess data.*earlier start already imported.*sqlite-backup.*empty the PostgreSQL database.*move/s,
      );

      expect(await sha256(sqliteFile)).toBe(before);
      expect(await q('SELECT username FROM "user"')).toEqual([{ username: 'here' }]);
      expect(await readdir(storageRoot)).toEqual(['attraccess.sqlite']);
    });

    it('converts values by the PostgreSQL column type', async () => {
      await sqlite(
        // creditBalance above 2^53: exact only when it never passes through a double.
        `INSERT INTO "user" (id, username, email, isEmailVerified, createdAt, creditBalance) VALUES
          (1, 'ada', 'ada@example.com', 1, '2026-01-02 03:04:05', 9007199254740993),
          (2, 'bob', 'bob@example.com', 0, '2026-01-02T03:04:05.678+02:00', 0)`,
        `INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')`,
        `INSERT INTO resource_flow_node (id, type, data, resourceId, positionX, positionY) VALUES
          ('n1', 'input', '{"label":"Start","nested":{"a":[1,2]}}', 1, 76.0425, -12)`,
        [
          `INSERT INTO resource_meter (id, resourceId, name, lifetimeValue, counterValue) VALUES (1, 1, 'kWh', ?, ?)`,
          ['123456789012345678901234567890.123456789', '1000.000000001'],
        ],
      );

      await runImport();

      expect(
        await q(`SELECT id, "isEmailVerified", "createdAt" FROM "user" ORDER BY id`).then((rows) =>
          rows.map((row) => ({ ...row, createdAt: (row.createdAt as Date).toISOString() })),
        ),
      ).toEqual([
        { id: 1, isEmailVerified: true, createdAt: '2026-01-02T03:04:05.000Z' },
        { id: 2, isEmailVerified: false, createdAt: '2026-01-02T01:04:05.678Z' },
      ]);
      expect(await q(`SELECT "creditBalance"::text AS balance FROM "user" WHERE id = 1`)).toEqual([
        { balance: '9007199254740993' },
      ]);
      expect(await q(`SELECT data, "positionX", "positionY" FROM resource_flow_node`)).toEqual([
        { data: { label: 'Start', nested: { a: [1, 2] } }, positionX: 76.0425, positionY: -12 },
      ]);
      expect(await q(`SELECT "lifetimeValue", "counterValue" FROM resource_meter`)).toEqual([
        { lifetimeValue: '123456789012345678901234567890.123456789', counterValue: '1000.000000001' },
      ]);
    });

    it('refuses an instant it cannot read, naming table, row key and column, and imports nothing', async () => {
      await sqlite(
        `INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`,
        `INSERT INTO resource (id, name, type, createdAt) VALUES (7, 'Laser', 'machine', 'yesterday at noon')`,
      );

      const roles = await q('SELECT key FROM role ORDER BY key');
      const failure = runImport();
      await expect(failure).rejects.toThrow('Table resource, row id=7, column createdAt: the value is not an instant');
      await expect(failure).rejects.toThrow(/nothing was imported and the file stays where it is/);
      await expect(failure).rejects.not.toThrow(/yesterday at noon/);
      expect(await q('SELECT 1 FROM "user"')).toEqual([]);
      expect(await q('SELECT key FROM role ORDER BY key')).toEqual(roles);
      expect(await disabledTriggers()).toEqual([]);
      expect(await readdir(storageRoot)).toEqual(['attraccess.sqlite']);
    });

    it('takes balances from SQLite instead of applying the transactions a second time', async () => {
      await sqlite(
        `INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`,
        `INSERT INTO billing_transaction (id, userId, amount, status) VALUES (1, 1, 1000, 'completed'), (2, 1, -150, 'completed')`,
      );

      await runImport();

      expect(await q('SELECT "creditBalance" FROM "user"')).toEqual([{ creditBalance: 850 }]);
      // The balance triggers are active again.
      await pg.query(`INSERT INTO billing_transaction ("userId", amount, status) VALUES (1, -50, 'completed')`);
      expect(await q('SELECT "creditBalance" FROM "user"')).toEqual([{ creditBalance: 800 }]);
    });

    it('copies legacy rows the integrity triggers would refuse today, and enables the triggers again', async () => {
      const source = createSqliteSource(sqliteFile);
      await source.initialize();
      try {
        const triggers: { name: string }[] = await source.query(
          `SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'resource_usage'`,
        );
        for (const { name } of triggers) await source.query(`DROP TRIGGER "${name}"`);
      } finally {
        await source.destroy();
      }
      await sqlite(
        `INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`,
        `INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')`,
        // Two published open sessions of one user on one resource: a legacy duplicate.
        `INSERT INTO resource_usage (id, usageAction, resourceId, userId, startTime, isFinalized, lifecyclePending)
          VALUES (1, 'usage', 1, 1, '2026-01-01 10:00:00', 1, 0), (2, 'usage', 1, 1, '2026-01-01 11:00:00', 1, 0)`,
      );

      await runImport();

      expect(await q('SELECT id FROM resource_usage ORDER BY id')).toEqual([{ id: 1 }, { id: 2 }]);
      expect(await disabledTriggers()).toEqual([]);
    });

    it('continues generated ids after the highest id SQLite ever issued', async () => {
      await sqlite(
        `INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com'), (40, 'gone', 'gone@example.com')`,
        `DELETE FROM "user" WHERE id = 40`,
      );

      await runImport();

      const [{ id }] = await q<{ id: number }>(
        `INSERT INTO "user" (username, email) VALUES ('next', 'next@example.com') RETURNING id`,
      );
      expect(id).toBe(41);
    });

    it('continues generated ids after the highest id in the table when sqlite_sequence is lower', async () => {
      await sqlite(
        `INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com'), (40, 'eve', 'eve@example.com')`,
        `DELETE FROM sqlite_sequence WHERE name = 'user'`,
      );

      await runImport();

      const [{ id }] = await q<{ id: number }>(
        `INSERT INTO "user" (username, email) VALUES ('next', 'next@example.com') RETURNING id`,
      );
      expect(id).toBe(41);
    });

    it('replaces the rows the baseline seeded with the installation rows', async () => {
      await sqlite(
        `DELETE FROM role WHERE key <> 'administrator'`,
        `UPDATE role SET name = 'Chief' WHERE key = 'administrator'`,
      );
      expect((await q('SELECT 1 FROM role')).length).toBeGreaterThan(1);

      await runImport();

      expect(await q('SELECT key, name FROM role')).toEqual([{ key: 'administrator', name: 'Chief' }]);
    });

    it('skips plugin and unknown tables and names them once, with where their data stays', async () => {
      await sqlite(
        `INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`,
        `CREATE TABLE plugin_bookings_booking (id integer PRIMARY KEY, note text)`,
        `INSERT INTO plugin_bookings_booking (note) VALUES ('Router')`,
        `CREATE TABLE plugin_migrations_bookings (id integer PRIMARY KEY, name text)`,
      );

      await runImport();

      const backup = join(storageRoot, 'sqlite-backup', 'attraccess.sqlite');
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('plugin_bookings_booking, plugin_migrations_bookings'),
      );
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(backup));
      expect(
        await q(
          `SELECT 1 FROM information_schema.tables
            WHERE table_name IN ('plugin_bookings_booking', 'plugin_migrations_bookings')`,
        ),
      ).toEqual([]);
    });

    it('refuses a SQLite column PostgreSQL has no column for, naming table and column', async () => {
      await sqlite(`ALTER TABLE resource ADD COLUMN legacyNote text`);
      await expect(runImport()).rejects.toThrow('Table resource: the SQLite column legacyNote has no counterpart');
    });

    it('rolls the whole import back on a broken foreign key, names table, constraint and keys, and keeps the file', async () => {
      await sqlite(
        `INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`,
        'PRAGMA foreign_keys = OFF',
        `INSERT INTO billing_transaction (id, userId, amount, status) VALUES (5, 99, 10, 'pending')`,
      );

      const keys = await foreignKeyCount();
      await expect(runImport()).rejects.toThrow(
        /Table billing_transaction breaks the foreign key \S+ \(references user\).*\[\{"id":"5","userId":"99"\}\]/,
      );
      expect(await foreignKeyCount()).toBe(keys);
      expect(await disabledTriggers()).toEqual([]);

      expect(await q('SELECT 1 FROM "user"')).toEqual([]);
      expect((await q('SELECT 1 FROM role')).length).toBeGreaterThan(0);
      expect(await q('SELECT conname FROM pg_constraint WHERE NOT convalidated')).toEqual([]);
      expect(await readdir(storageRoot)).toEqual(['attraccess.sqlite']);

      // Fixed in the file, the next run imports it.
      await sqlite('DELETE FROM billing_transaction WHERE id = 5');
      await runImport();
      expect(await q('SELECT username FROM "user"')).toEqual([{ username: 'ada' }]);
    });

    it('moves the file next to an earlier backup under a timestamped name, never overwriting it', async () => {
      await sqlite(`INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`);
      const backups = join(storageRoot, 'sqlite-backup');
      await mkdir(backups);
      await writeFile(join(backups, 'attraccess.sqlite'), 'earlier backup');

      await runImport();

      expect((await readdir(backups)).sort()).toEqual(['attraccess-20261121T093000123Z.sqlite', 'attraccess.sqlite']);
      expect(await readFile(join(backups, 'attraccess.sqlite'), 'utf8')).toBe('earlier backup');
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringMatching(
          /SQLite import complete: \d+ rows in \d+ tables; the SQLite file is at .*attraccess-20261121T093000123Z/,
        ),
      );
    });

    it('only warns when the file cannot be moved after the commit', async () => {
      await sqlite(`INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`);
      // A file where the backup folder should be: the move fails.
      await writeFile(join(storageRoot, 'sqlite-backup'), 'in the way');

      await runImport();

      expect(await q('SELECT username FROM "user"')).toEqual([{ username: 'ada' }]);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/data is in PostgreSQL, but moving .* failed/));
      expect((await readdir(storageRoot)).sort()).toEqual(['attraccess.sqlite', 'sqlite-backup']);
    });
  });
});

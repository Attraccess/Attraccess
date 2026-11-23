import { Logger } from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import type { DataSource } from 'typeorm';
import { disposeMigratedSqliteTemplate } from '../../database/sqlite/sqlite-import.test-fixture';
import { olderStates } from './fixtures/older-states.test-fixture';
import { postgresExpectations } from './fixtures/older-states-postgres.test-fixture';
import {
  createLifecycleDatabase,
  recordedMigrations,
  trackMigrationNames,
  type LifecycleDatabase,
} from './fixtures/postgres-lifecycle.test-fixture';
import {
  compareWithSqlite,
  createOldInstallation,
  sequencesBehindSqlite,
  withStorageRoot,
  type OldInstallation,
} from './fixtures/sqlite-installation.test-fixture';

jest.setTimeout(600_000);

afterAll(disposeMigratedSqliteTemplate);

/**
 * The upgrade path of a SQLite installation: the PostgreSQL track runs on a blank database with STORAGE_ROOT holding
 * the SQLite file of an older release (its schema exactly as that release created it, with the data that release
 * wrote). The import migration brings the file to the last SQLite migration, copies it and moves it to the backup
 * folder; that moved file is the final SQLite state every core table is compared with.
 */
describe.each(olderStates)('starting PostgreSQL on the SQLite database of the $name', (state) => {
  let installation: OldInstallation;
  let lifecycle: LifecycleDatabase;
  let pg: DataSource;
  let applied: string[];
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    installation = await createOldInstallation(state);
    lifecycle = await createLifecycleDatabase();
    pg = await lifecycle.open();
    applied = await withStorageRoot(installation.storageRoot, async () =>
      (await pg.runMigrations()).map((migration) => migration.name),
    );
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await lifecycle?.close();
    await installation?.remove();
  });

  it('runs the whole PostgreSQL track, the import included, and moves the SQLite file to the backup folder', async () => {
    expect(applied).toEqual(trackMigrationNames());
    expect(await recordedMigrations(pg)).toEqual(trackMigrationNames());
    expect(await readdir(installation.storageRoot)).toEqual(['sqlite-backup']);
    expect(await readdir(`${installation.storageRoot}/sqlite-backup`)).toEqual(['attraccess.sqlite']);
  });

  it('holds every core table of the migrated SQLite file, row by row', async () => {
    expect(await compareWithSqlite(pg, installation.backup)).toEqual([]);
    const [{ users }] = await pg.query('SELECT COUNT(*)::int AS users FROM "user"');
    expect(users).toBeGreaterThan(0);
  });

  it("keeps the upgraded instance on today's machine list visibility, because it has accounts (ATT-843)", async () => {
    expect(
      await pg.query(`SELECT "value" FROM "setting" WHERE "parent" = 'resources' AND "key" = 'list_visibility'`),
    ).toEqual([{ value: 'authenticated' }]);
  });

  it('keeps foreign keys valid and continues generated ids after the highest id SQLite issued', async () => {
    expect(await pg.query('SELECT conname FROM pg_constraint WHERE NOT convalidated')).toEqual([]);
    expect(await sequencesBehindSqlite(pg, installation.backup)).toEqual([]);
  });

  it('holds the data of that release with its types', async () => {
    await postgresExpectations[state.name](pg);
  });

  it('applies the later migrations on the imported data: every form is a resource form', async () => {
    expect(await pg.query(`SELECT id FROM form WHERE scope <> 'resource'`)).toEqual([]);
  });

  it('names the SQLite tables it did not copy (plugin data) once', async () => {
    const skipped = warn.mock.calls.filter(([message]) => String(message).startsWith('Not imported'));
    if (state.name.startsWith('release with open work')) {
      expect(skipped).toEqual([[expect.stringContaining('plugin_bookings_booking, plugin_migrations_bookings')]]);
    } else {
      expect(skipped).toEqual([]);
    }
  });
});

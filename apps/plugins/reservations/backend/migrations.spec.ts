import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import * as pluginMigrations from './migrations';

describe('plugin migrations', () => {
  let dir: string;
  let dataSource: DataSource;
  const indexes = async () =>
    (
      await dataSource.query(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'reservations_reservation' AND name LIKE 'IDX_%'`,
      )
    )
      .map((row: { name: string }) => row.name)
      .sort();

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'reservations-migrations-'));
    dataSource = await new DataSource({
      type: 'sqlite',
      database: join(dir, 'db.sqlite'),
      migrations: Object.values(pluginMigrations),
    }).initialize();
  });
  afterEach(async () => {
    await dataSource.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers every migration in timestamp order with a unique name', () => {
    const names = Object.values(pluginMigrations).map((migration) => new migration().name);
    const timestamps = names.map((name) => Number(/\d{13}$/.exec(name)?.[0]));
    expect(timestamps.every(Number.isFinite)).toBe(true);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('AddReservationStatusIndexes1790000000001');
  });

  it('creates the scheduler indexes on status + start/end and reverts them', async () => {
    await dataSource.runMigrations();
    expect(await indexes()).toEqual([
      'IDX_reservations_reservation_slot',
      'IDX_reservations_reservation_status_end',
      'IDX_reservations_reservation_status_start',
      'IDX_reservations_reservation_user',
    ]);
    const plan = await dataSource.query(
      `EXPLAIN QUERY PLAN SELECT id FROM reservations_reservation WHERE status = 'confirmed' AND endTime <= '2026-06-01'`,
    );
    expect(JSON.stringify(plan)).toContain('IDX_reservations_reservation_status_end');
    await dataSource.undoLastMigration(); // add-show-names-on-readers
    await dataSource.undoLastMigration(); // add-reservation-status-indexes
    expect(await indexes()).toEqual(['IDX_reservations_reservation_slot', 'IDX_reservations_reservation_user']);
    await dataSource.runMigrations();
    expect(await indexes()).toHaveLength(4);
  });

  it('adds showNamesOnReaders off by default, keeps existing rows, and reverts', async () => {
    await dataSource.runMigrations();
    const columns = async () =>
      (await dataSource.query(`PRAGMA table_info("reservations_resource_settings")`)) as {
        name: string;
        dflt_value: string;
        notnull: number;
      }[];
    expect((await columns()).find((c) => c.name === 'showNamesOnReaders')).toMatchObject({
      notnull: 1,
      dflt_value: '0',
    });
    expect(new pluginMigrations.AddShowNamesOnReaders1790000000002().name).toBe('AddShowNamesOnReaders1790000000002');

    await dataSource.undoLastMigration();
    expect((await columns()).map((c) => c.name)).not.toContain('showNamesOnReaders');
    await dataSource.query(
      `INSERT INTO "reservations_resource_settings" ("resourceId", "enabled", "updatedAt") VALUES (7, 1, '2026-06-01')`,
    );
    await dataSource.runMigrations();
    expect(
      await dataSource.query(`SELECT "enabled", "showNamesOnReaders" FROM "reservations_resource_settings"`),
    ).toEqual([{ enabled: 1, showNamesOnReaders: 0 }]);
  });
});

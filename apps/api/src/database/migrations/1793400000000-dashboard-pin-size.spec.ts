import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { DashboardPins1793300000000 } from './1793300000000-dashboard-pins';
import { DashboardPinSize1793400000000 } from './1793400000000-dashboard-pin-size';

describe('Dashboard pin size migration', () => {
  let directory: string;
  let source: DataSource;

  const columns = async () =>
    ((await source.query(`PRAGMA table_info("dashboard_pin")`)) as { name: string }[]).map(({ name }) => name);

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dashboard-pin-size-'));
    source = await new DataSource({ type: 'better-sqlite3', database: join(directory, 'test.sqlite') }).initialize();
    await source.query(`CREATE TABLE "user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)`);
    await new DashboardPins1793300000000().up(source.createQueryRunner());
  });

  afterEach(async () => {
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('adds a nullable size column that existing pins leave empty, and removes it again', async () => {
    await source.query(`INSERT INTO "user" ("id") VALUES (1)`);
    await source.query(
      `INSERT INTO "dashboard_pin" ("userId", "itemType", "itemId", "position") VALUES (1, 'widget', 'messages', 0)`,
    );
    const migration = new DashboardPinSize1793400000000();

    await migration.up(source.createQueryRunner());
    expect(await columns()).toContain('size');
    expect(await source.query(`SELECT "size" FROM "dashboard_pin"`)).toEqual([{ size: null }]);

    await migration.down(source.createQueryRunner());
    expect(await columns()).not.toContain('size');
    expect(await source.query(`SELECT "itemId" FROM "dashboard_pin"`)).toEqual([{ itemId: 'messages' }]);
  });
});

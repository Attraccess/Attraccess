import { DataSource } from 'typeorm';
import { PluginReaders1793800000000 } from './1793800000000-plugin-readers';

describe('PluginReaders1793800000000', () => {
  let source: DataSource;
  const migration = new PluginReaders1793800000000();

  beforeEach(async () => {
    source = await new DataSource({ type: 'better-sqlite3', database: ':memory:' }).initialize();
    await source.query('PRAGMA foreign_keys = ON');
    await source.query(
      `CREATE TABLE "resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL)`,
    );
    await source.query(`INSERT INTO "resource" ("name") VALUES ('door')`);
  });

  afterEach(() => source.destroy());

  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  };

  const tables = async () =>
    (await source.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plugin_reader'`)).length;
  const insert = (pluginId: string, deviceId: string, resourceId: number | null = 1) =>
    source.query(
      `INSERT INTO "plugin_reader" ("pluginId", "deviceId", "name", "capabilities", "resourceId") VALUES (?, ?, 'r', '{}', ?)`,
      [pluginId, deviceId, resourceId],
    );

  it('enforces one reader per plugin and device id', async () => {
    await run('up');
    await insert('p', 'd');
    await insert('other', 'd');
    await expect(insert('p', 'd')).rejects.toThrow(/UNIQUE/);
  });

  it('keeps the reader but drops its assignment when the resource is deleted', async () => {
    await run('up');
    await insert('p', 'd');
    await source.query(`DELETE FROM "resource" WHERE "id" = 1`);
    expect(await source.query(`SELECT "deviceId", "resourceId" FROM "plugin_reader"`)).toEqual([
      { deviceId: 'd', resourceId: null },
    ]);
  });

  it('can run twice and reverts cleanly', async () => {
    await run('up');
    await run('up');
    await run('down');
    expect(await tables()).toBe(0);
    await run('down');
    await run('up');
    expect(await tables()).toBe(1);
  });
});

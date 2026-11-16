import { DataSource } from 'typeorm';
import { PluginBleTransport1793200000000 } from './1793200000000-plugin-ble-transport';

describe('PluginBleTransport1793200000000', () => {
  let source: DataSource;
  const migration = new PluginBleTransport1793200000000();

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    await source.query(
      `CREATE TABLE "attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL)`,
    );
    await source.query(`INSERT INTO "attractap" ("name") VALUES ('existing reader')`);
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
    (await source.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plugin_ble_endpoint'`)).length;
  const columns = async () =>
    (await source.query(`PRAGMA table_info("attractap")`)).map((c: { name: string }) => c.name);

  it('adds the opt-in column (off for existing readers) and the endpoint table', async () => {
    await run('up');
    expect(await columns()).toContain('allowPluginBle');
    expect(await source.query(`SELECT "allowPluginBle" FROM "attractap"`)).toEqual([{ allowPluginBle: 0 }]);
    expect(await tables()).toBe(1);
  });

  it('enforces one binding per plugin, reader and address, and cascades with the reader', async () => {
    await run('up');
    const insert = (id: string) =>
      source.query(
        `INSERT INTO "plugin_ble_endpoint" ("id", "pluginId", "readerId", "address", "addressType", "profileId") VALUES (?, 'p', 1, 'AA:BB:CC:DD:EE:01', 'public', 'x')`,
        [id],
      );
    await insert('one');
    await expect(insert('two')).rejects.toThrow(/UNIQUE/);
    await source.query(`DELETE FROM "attractap" WHERE "id" = 1`);
    expect(await source.query(`SELECT * FROM "plugin_ble_endpoint"`)).toEqual([]);
  });

  it('can run twice and reverts cleanly', async () => {
    await run('up');
    await run('up');
    await run('down');
    expect(await tables()).toBe(0);
    expect(await columns()).not.toContain('allowPluginBle');
    await run('down');
    await run('up');
    expect(await tables()).toBe(1);
  });
});

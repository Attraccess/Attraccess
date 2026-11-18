import { entities } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import * as migrations from '.';
import { PluginDeclaredPermissions1793600000000 } from './1793600000000-plugin-declared-permissions';

const NEW_COLUMNS = ['pluginName', 'labelDe', 'descriptionDe', 'categoryLabel', 'categoryLabelDe', 'available'];

describe('plugin-declared permissions migration', () => {
  let source: DataSource;
  const migration = new PluginDeclaredPermissions1793600000000();
  const columns = async () =>
    ((await source.query(`PRAGMA table_info("permission")`)) as Array<{ name: string }>).map((column) => column.name);
  const coreRows = () =>
    source.query(`SELECT "key", "label", "description", "category" FROM "permission" ORDER BY "key"`);

  beforeEach(async () => {
    source = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('adds the plugin columns, leaving core rows unowned, available and otherwise unchanged', async () => {
    expect(await columns()).toEqual(expect.arrayContaining(NEW_COLUMNS));
    const rows = await source.query(`SELECT "pluginName", "labelDe", "available" FROM "permission"`);
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (row: { pluginName: null; labelDe: null; available: number }) =>
          row.pluginName === null && row.labelDe === null && row.available === 1,
      ),
    ).toBe(true);
  });

  it('is idempotent', async () => {
    const runner = source.createQueryRunner();
    await migration.up(runner);
    await runner.release();
    expect(await columns()).toEqual(expect.arrayContaining(NEW_COLUMNS));
  });

  it('down removes plugin keys with their grants and the columns, keeping core rows and grants', async () => {
    const before = await coreRows();
    const coreGrants = await source.query(`SELECT COUNT(*) AS count FROM "role_permission"`);
    await source.query(
      `INSERT INTO "permission" ("key", "label", "description", "category", "pluginName", "available") VALUES ('acme.widgets.read', 'View', 'View', 'plugin:acme', 'acme', 0)`,
    );
    await source.query(
      `INSERT INTO "role_permission" ("roleId", "permissionKey") SELECT "id", 'acme.widgets.read' FROM "role" WHERE "key" = 'administrator'`,
    );
    await source.getRepository(entities.User).save({ id: 1, username: 'owner', email: 'owner@example.com' });
    await source.query(`INSERT INTO "api_token" ("id", "userId", "name", "tokenHash") VALUES (1, 1, 'ci', 'hash')`);
    await source.query(
      `INSERT INTO "api_token_permission" ("apiTokenId", "permissionKey") VALUES (1, 'resources.read'), (1, 'acme.widgets.read')`,
    );

    const runner = source.createQueryRunner();
    await migration.down(runner);
    await runner.release();

    expect(await columns()).toEqual(expect.not.arrayContaining(NEW_COLUMNS));
    expect(await coreRows()).toEqual(before);
    expect(await source.query(`SELECT COUNT(*) AS count FROM "role_permission"`)).toEqual(coreGrants);
    expect(await source.query(`SELECT "permissionKey" FROM "api_token_permission"`)).toEqual([
      { permissionKey: 'resources.read' },
    ]);

    const again = source.createQueryRunner();
    await migration.up(again);
    await again.release();
    expect(await columns()).toEqual(expect.arrayContaining(NEW_COLUMNS));
  });
});

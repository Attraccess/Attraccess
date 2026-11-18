import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import { PluginService } from './plugin.service';
import { PluginMigrationService } from './plugin-migration.service';
import { LoadedPluginManifest } from './plugin.manifest';
import { compilePluginStorage } from './plugin-storage/storage-schema';
import { claimStorageNames, releaseStorageNames } from './plugin-storage/storage-registry';

const bundle = (storage: string) => `
const { definePluginStorage, f, step, table } = require('@attraccess/plugins-backend-sdk');
const widgets = table({ id: f.id(), label: f.string() });
const gizmos = table({ id: f.id() });
exports.default = { register: () => ({ module: class WidgetsModule {} }), storage: ${storage} };
`;

const V1 = `definePluginStorage({
  tables: { widgets },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('widgets', widgets)] }],
})`;

const V2 = `definePluginStorage({
  tables: { widgets, gizmos },
  migrations: [
    { version: 1, name: 'baseline', steps: [step.createTable('widgets', widgets)] },
    { version: 2, name: 'gizmos', steps: [step.createTable('gizmos', gizmos)] },
  ],
})`;

function writePlugin(root: string, name: string, source: string) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'index.js'), source, 'utf8');
  writeFileSync(
    join(dir, 'plugin.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
      attraccessVersion: { min: '2.0.0-0' },
      permissions: ['PLUGIN_STORAGE'],
    }),
  );
}

describe('plugin storage ownership', () => {
  let root: string;
  let dbFile: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-ownership-'));
    dbFile = join(root, 'test.sqlite');
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginMigrationService.configureForTesting({ type: 'sqlite', database: dbFile });
  });

  afterEach(() => {
    for (const name of ['widgets', 'Widgets', 'foo-bar', 'foo_bar']) releaseStorageNames(name);
    PluginMigrationService.configureForTesting(null);
    rmSync(root, { recursive: true, force: true });
  });

  const plugin = (name: string) => {
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    return PluginService.getPlugins().find((candidate) => candidate.name === name) as LoadedPluginManifest;
  };

  async function query(sql: string): Promise<Record<string, unknown>[]> {
    const probe = new DataSource({ type: 'sqlite', database: dbFile });
    await probe.initialize();
    try {
      return await probe.query(sql);
    } finally {
      await probe.destroy();
    }
  }
  const tables = async () =>
    (await query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)).map(
      (row) => row.name,
    );

  it('drops on uninstall nothing of a plugin whose first version never committed', async () => {
    // Someone else's table already has the declared name, so version 1 fails and is rolled back.
    await query(`CREATE TABLE "plugin_widgets_widgets" ("id" integer PRIMARY KEY, "owner" varchar)`);
    await query(`INSERT INTO "plugin_widgets_widgets" ("owner") VALUES ('someone else')`);
    writePlugin(root, 'widgets', bundle(V1));
    await expect(PluginMigrationService.runUpMigrations(plugin('widgets'))).rejects.toThrow(/already exists/);

    expect(await PluginMigrationService.dropStorage(plugin('widgets'))).toBe(true);

    expect(await query(`SELECT owner FROM "plugin_widgets_widgets"`)).toEqual([{ owner: 'someone else' }]);
  });

  it('drops on uninstall the tables of committed versions only', async () => {
    writePlugin(root, 'widgets', bundle(V1));
    await PluginMigrationService.runUpMigrations(plugin('widgets'));
    // The bundle on disk is already the next release, whose version 2 never ran; its table is not the plugin's.
    writePlugin(root, 'widgets', bundle(V2));
    await query(`CREATE TABLE "plugin_widgets_gizmos" ("id" integer PRIMARY KEY)`);

    expect(await PluginMigrationService.dropStorage(plugin('widgets'))).toBe(true);

    expect(await tables()).toEqual(['plugin_widgets_gizmos']);
  });

  it('claims the names before migrating: a conflicting plugin never touches the database', async () => {
    const other = definePluginStorage({
      tables: { things: table({ id: f.id() }) },
      migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('things', table({ id: f.id() }))] }],
    });
    claimStorageNames(compilePluginStorage('Widgets', other, { reservedTables: new Set() }));
    writePlugin(root, 'widgets', bundle(V1));

    await expect(PluginMigrationService.runUpMigrations(plugin('widgets'))).rejects.toThrow(
      /storage namespace "widgets" is the one of plugin "Widgets"/,
    );
    expect(await tables()).toEqual([]);
  });

  it('quarantines at startup the plugins that share a namespace, creating no table', async () => {
    writePlugin(root, 'foo-bar', bundle(V1));
    writePlugin(root, 'foo_bar', bundle(V1));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });

    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();

    for (const name of ['foo-bar', 'foo_bar']) expect(PluginService.isPluginQuarantined(plugin(name))).toBe(true);
    expect(await tables()).toEqual([]);
  });
});

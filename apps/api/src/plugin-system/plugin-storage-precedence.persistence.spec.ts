import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { PluginService } from './plugin.service';
import { PluginMigrationService } from './plugin-migration.service';
import { LoadedPluginManifest } from './plugin.manifest';
import { StorageMigrationRunner } from './plugin-storage/storage-migration-runner';
import { isEstablishedStorage, recordEstablishedStorage } from './plugin-storage/storage-precedence';
import { releaseStorageNames } from './plugin-storage/storage-registry';

/** A backend bundle that declares one table `controllers` (physical `plugin_<namespace>_controllers`). */
const BUNDLE = `
const { definePluginStorage, f, step, table } = require('@attraccess/plugins-backend-sdk');
const controllers = table({ id: f.id(), label: f.string() });
exports.default = {
  register: () => ({ module: class StorageModule {} }),
  storage: definePluginStorage({
    tables: { controllers },
    migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('controllers', controllers)] }],
  }),
};
`;

function writePlugin(root: string, name: string) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'index.js'), BUNDLE, 'utf8');
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

/**
 * `wago` keeps its data in `plugin_wago_controllers`. A plugin named `plugin-wago` has the namespace `plugin_wago`,
 * whose short prefix `plugin_wago_` contains every table of `wago`. When the newcomer arrives beside the established
 * plugin (a folder drop, or installed while `wago` was not loaded), the newcomer is refused and `wago` keeps loading.
 */
describe('storage precedence of established plugins', () => {
  let root: string;
  let dbFile: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-precedence-'));
    dbFile = join(root, 'test.sqlite');
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginMigrationService.configureForTesting({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: dbFile,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const name of ['wago', 'plugin-wago']) releaseStorageNames(name);
    recordEstablishedStorage([]);
    PluginMigrationService.configureForTesting(null);
    rmSync(root, { recursive: true, force: true });
  });

  /** A new process: fresh discovery and no in-memory claims (quarantines persist on disk, as in production). */
  async function boot(): Promise<void> {
    for (const name of ['wago', 'plugin-wago']) releaseStorageNames(name);
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();
  }

  const plugin = (name: string) =>
    PluginService.getPlugins().find((candidate) => candidate.name === name) as LoadedPluginManifest;

  async function query(sql: string): Promise<Record<string, unknown>[]> {
    const probe = new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: dbFile,
    });
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
  const WAGO_TABLES = ['plugin_storage_migrations_wago', 'plugin_wago_controllers'];

  async function establishWago(): Promise<void> {
    writePlugin(root, 'wago');
    await boot();
    await query(`INSERT INTO "plugin_wago_controllers" ("label") VALUES ('hall')`);
    expect(await tables()).toEqual(WAGO_TABLES);
  }

  it('refuses the newcomer and keeps the established plugin loading, touching no table', async () => {
    await establishWago();
    writePlugin(root, 'plugin-wago');

    await boot();
    await boot();

    expect(PluginService.isPluginQuarantined(plugin('wago'))).toBe(false);
    expect(PluginService.isPluginQuarantined(plugin('plugin-wago'))).toBe(true);
    expect(PluginService.pluginQuarantineError(plugin('plugin-wago').pluginDirectory)).toMatch(
      /namespace "plugin_wago" overlaps the namespace "wago" of the installed plugin "wago", which already keeps data/,
    );
    expect(await tables()).toEqual(WAGO_TABLES);
    expect(await query(`SELECT label FROM "plugin_wago_controllers"`)).toEqual([{ label: 'hall' }]);
    // The established plugin's storage still compiles beside the newcomer (module load, uninstall).
    expect(PluginMigrationService.loadStorage(plugin('wago'))?.namespace).toBe('wago');
  });

  it('refuses the newcomer while the established plugin is license-blocked, and loads the plugin once licensed', async () => {
    await establishWago();
    writePlugin(root, 'plugin-wago');
    const license = jest
      .spyOn(PluginService, 'getLicenseMissingReason')
      .mockImplementation((manifest) => ((manifest as LoadedPluginManifest).name === 'wago' ? 'unlicensed' : null));

    await boot();
    expect(PluginService.isPluginQuarantined(plugin('plugin-wago'))).toBe(true);
    expect(await tables()).toEqual(WAGO_TABLES);

    license.mockReturnValue(null);
    await boot();
    expect(PluginService.isPluginQuarantined(plugin('wago'))).toBe(false);
    expect(await tables()).toEqual(WAGO_TABLES);
  });

  it('counts a 1.x history as committed storage', async () => {
    await query(`CREATE TABLE "plugin_migrations_wago" ("id" integer PRIMARY KEY, "timestamp" bigint, "name" varchar)`);
    await query(`INSERT INTO "plugin_migrations_wago" ("timestamp", "name") VALUES (1, 'Init1')`);
    writePlugin(root, 'wago');
    writePlugin(root, 'plugin-wago');

    await boot();

    expect(PluginService.isPluginQuarantined(plugin('plugin-wago'))).toBe(true);
    expect(await tables()).not.toContain('plugin_plugin_wago_controllers');
  });

  it('refuses, when neither has committed storage, the plugin whose names lie in the other namespace', async () => {
    writePlugin(root, 'wago');
    writePlugin(root, 'plugin-wago');

    await boot();

    // `wago`'s tables lie in the namespace of `plugin-wago`; each plugin's names are checked against the other's
    // namespace, so `wago` is refused whichever plugin is discovered or migrated first.
    expect(PluginService.isPluginQuarantined(plugin('wago'))).toBe(true);
    expect(PluginService.isPluginQuarantined(plugin('plugin-wago'))).toBe(false);
    expect(await tables()).not.toContain('plugin_wago_controllers');
  });

  it('counts a plugin whose bookkeeping cannot be read as established, and a plugin without any as new', async () => {
    writePlugin(root, 'wago');
    writePlugin(root, 'plugin-wago');
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    await PluginMigrationService.resolveStoragePrecedence();
    expect([isEstablishedStorage('wago'), isEstablishedStorage('plugin-wago')]).toEqual([false, false]);

    jest.spyOn(StorageMigrationRunner.prototype, 'hasCommittedStorage').mockRejectedValue(new Error('locked'));
    await PluginMigrationService.resolveStoragePrecedence();
    expect([isEstablishedStorage('wago'), isEstablishedStorage('plugin-wago')]).toEqual([true, true]);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from 'pg';
import { createTestDatabaseLocation, type TestDatabaseLocation } from '../test-utils/test-database';
import { PluginService } from './plugin.service';
import { PluginMigrationService } from './plugin-migration.service';
import { LoadedPluginManifest } from './plugin.manifest';

/** A plugin backend bundle as a build would ship it: CommonJS with a default export that declares its storage. */
const bundle = (storage: string) => `
const { definePluginStorage, f, step, table } = require('@attraccess/plugins-backend-sdk');
const widgets = table({ id: f.id(), label: f.string() });
exports.default = { register: () => ({ module: class WidgetsModule {} }), storage: ${storage} };
`;

const WIDGETS_V1 = `definePluginStorage({
  tables: { widgets },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('widgets', widgets)] }],
})`;

const WIDGETS_V2 = `definePluginStorage({
  tables: { widgets, gizmos: table({ id: f.id() }) },
  migrations: [
    { version: 1, name: 'baseline', steps: [step.createTable('widgets', widgets)] },
    { version: 2, name: 'gizmos', steps: [step.createTable('gizmos', table({ id: f.id() }))] },
  ],
})`;

const FAILING = `definePluginStorage({
  tables: { widgets },
  migrations: [{
    version: 1, name: 'baseline', steps: [step.createTable('widgets', widgets)],
    data: async () => { throw new Error('constraint exploded'); },
  }],
})`;

function writePlugin(root: string, folder: string, name: string, source: string, permissions = ['PLUGIN_STORAGE']) {
  const dir = join(root, folder);
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'index.js'), source, 'utf8');
  writeFileSync(
    join(dir, 'plugin.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
      attraccessVersion: { min: '2.0.0-0' },
      permissions,
    }),
  );
}

describe('PluginMigrationService', () => {
  let root: string;
  let database: TestDatabaseLocation;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'plugin-migration-'));
    database = await createTestDatabaseLocation({ empty: true });
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginMigrationService.configureForTesting({ type: 'postgres', url: database.location } as never);
  });

  afterEach(async () => {
    PluginMigrationService.configureForTesting(null);
    rmSync(root, { recursive: true, force: true });
    await database.remove();
  });

  const rediscover = (name: string) => {
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    return PluginService.getPlugins().find((plugin) => plugin.name === name) as LoadedPluginManifest;
  };

  async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const probe = new Client({ connectionString: database.location });
    await probe.connect();
    try {
      return (await probe.query(sql)).rows;
    } finally {
      await probe.end();
    }
  }
  const tableExists = async (table: string) =>
    (
      await query(
        `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}'`,
      )
    ).length > 0;
  const versions = async () =>
    await query<{ version: number; source: string }>(
      'SELECT version, source FROM plugin_storage_migrations_widgets ORDER BY version',
    );

  it('knows which plugins can have storage and loads the declaration from the backend bundle', () => {
    writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V1));
    writePlugin(root, 'plain', 'plain', bundle('undefined'), []);

    expect(PluginMigrationService.hasStorage(rediscover('widgets'))).toBe(true);
    expect(PluginMigrationService.loadStorage(rediscover('widgets'))?.ownedTables).toEqual(['plugin_widgets_widgets']);
    expect(PluginMigrationService.hasStorage(rediscover('plain'))).toBe(false);
    expect(PluginMigrationService.loadStorage(rediscover('plain'))).toBeNull();
  });

  it('creates the tables and tracks the history in a plugin-scoped table, apart from the host migrations', async () => {
    writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V1));

    expect(await PluginMigrationService.runUpMigrations(rediscover('widgets'))).toBe(1);

    expect(await tableExists('plugin_widgets_widgets')).toBe(true);
    expect(await versions()).toEqual([{ version: 1, source: 'migrated' }]);
    expect(await tableExists('migrations')).toBe(false);
  });

  it('is idempotent and applies only the versions a new release adds', async () => {
    writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V1));
    await PluginMigrationService.runUpMigrations(rediscover('widgets'));
    expect(await PluginMigrationService.runUpMigrations(rediscover('widgets'))).toBe(0);

    writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V2));
    expect(await PluginMigrationService.runUpMigrations(rediscover('widgets'))).toBe(1);

    expect(await tableExists('plugin_widgets_gizmos')).toBe(true);
    expect((await versions()).map((row) => row.version)).toEqual([1, 2]);
  });

  it('does nothing for a plugin without storage', async () => {
    writePlugin(root, 'plain', 'plain', bundle('undefined'), []);

    expect(await PluginMigrationService.runUpMigrations(rediscover('plain'))).toBeNull();
    expect(await PluginMigrationService.dropStorage(rediscover('plain'))).toBe(false);
    expect(
      await query(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'`),
    ).toEqual([]);
  });

  it('drops the tables and the bookkeeping on uninstall, leaving other plugins alone', async () => {
    writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V2));
    writePlugin(root, 'other', 'other', bundle(WIDGETS_V1).replace(/widgets/g, 'things'));
    await PluginMigrationService.runUpMigrations(rediscover('widgets'));
    await PluginMigrationService.runUpMigrations(rediscover('other'));

    expect(await PluginMigrationService.dropStorage(rediscover('widgets'))).toBe(true);

    expect(await tableExists('plugin_widgets_widgets')).toBe(false);
    expect(await tableExists('plugin_widgets_gizmos')).toBe(false);
    expect(await tableExists('plugin_storage_migrations_widgets')).toBe(false);
    expect(await tableExists('plugin_other_things')).toBe(true);
  });

  it('rolls a failing migration back as a whole: no table and no history stay behind', async () => {
    writePlugin(root, 'widgets', 'widgets', bundle(FAILING));

    await expect(PluginMigrationService.runUpMigrations(rediscover('widgets'))).rejects.toThrow(
      /Migration 1 of plugin "widgets" failed and was rolled back: constraint exploded/,
    );

    expect(await tableExists('plugin_widgets_widgets')).toBe(false);
    expect(await tableExists('plugin_storage_migrations_widgets')).toBe(false);

    // After the plugin author ships a fix, the install succeeds from a clean state.
    writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V1));
    expect(await PluginMigrationService.runUpMigrations(rediscover('widgets'))).toBe(1);
  });

  it('runs boot migrations while quarantining and disabling only the failing plugin', async () => {
    writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V1));
    writePlugin(root, 'broken', 'broken', bundle(FAILING));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });

    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();

    expect(await tableExists('plugin_widgets_widgets')).toBe(true);
    expect(await tableExists('plugin_broken_widgets')).toBe(false);
    const broken = PluginService.getPlugins().find((plugin) => plugin.name === 'broken');
    expect(PluginService.isPluginQuarantined(broken as LoadedPluginManifest)).toBe(true);
    expect(PluginService.isPluginQuarantined(rediscover('widgets'))).toBe(false);
  });

  it('quarantines a plugin whose declaration leaves its namespace, without touching the database', async () => {
    const escaping = `definePluginStorage({
      tables: { users: table({ id: f.id() }, { physicalName: 'user' }) },
      migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('users', table({ id: f.id() }, { physicalName: 'user' }))] }],
    })`;
    writePlugin(root, 'widgets', 'widgets', bundle(escaping));
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });

    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();

    expect(PluginService.isPluginQuarantined(PluginService.getPlugins()[0])).toBe(true);
    expect(
      await query(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'`),
    ).toEqual([]);
  });

  describe('replacement', () => {
    it('blocks a release older than the database, before anything changes', async () => {
      writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V2));
      await PluginMigrationService.runUpMigrations(rediscover('widgets'));
      const replacement = join(root, 'replacement');
      writePlugin(replacement, 'widgets', 'widgets', bundle(WIDGETS_V1));

      await expect(
        PluginMigrationService.assertReplacementMigrationHistory(rediscover('widgets'), replacement),
      ).rejects.toThrow(/database is at version 2 but this release only knows up to version 1/);

      expect((await versions()).map((row) => row.version)).toEqual([1, 2]);
    });

    it('accepts a newer release without applying it', async () => {
      writePlugin(root, 'widgets', 'widgets', bundle(WIDGETS_V1));
      await PluginMigrationService.runUpMigrations(rediscover('widgets'));
      const replacement = join(root, 'replacement');
      writePlugin(replacement, 'widgets', 'widgets', bundle(WIDGETS_V2));

      await PluginMigrationService.assertReplacementMigrationHistory(rediscover('widgets'), replacement);

      expect(await tableExists('plugin_widgets_gizmos')).toBe(false);
    });

    it('refuses a release when 1.x migrations are only partly applied, without changing anything', async () => {
      const adopting = `definePluginStorage({
        tables: { widgets },
        migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('widgets', widgets)] }],
        adoption: { legacyMigrations: ['CreateWidgets1', 'AddLabel2'] },
      })`;
      writePlugin(root, 'widgets', 'widgets', bundle(adopting));
      await query(
        `CREATE TABLE "plugin_migrations_widgets" ("id" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "timestamp" bigint NOT NULL, "name" varchar NOT NULL)`,
      );
      await query(`INSERT INTO "plugin_migrations_widgets" ("timestamp", "name") VALUES (1, 'CreateWidgets1')`);

      await expect(
        PluginMigrationService.assertReplacementMigrationHistory(rediscover('widgets'), root),
      ).rejects.toThrow(/update to Attraccess 1\.11 and start it once/);
      await expect(PluginMigrationService.runUpMigrations(rediscover('widgets'))).rejects.toThrow(/partial history/);

      expect(
        (
          await query(
            `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
          )
        ).map((row) => row.name),
      ).toEqual(['plugin_migrations_widgets']);
    });
  });
});

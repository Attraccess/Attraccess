import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { PluginService } from './plugin.service';
import { PluginMigrationService } from './plugin-migration.service';
import { LoadedPluginManifest } from './plugin.manifest';

// A plain-CommonJS migrations entry, exactly as a built plugin would ship one:
// it creates and drops a single table. Authored without importing typeorm so the
// test fixture stays dependency-free; the host runs up()/down() with its own
// QueryRunner.
const MIGRATION_ENTRY = `
class CreateWidget1700000000000 {
  constructor() { this.name = 'CreateWidget1700000000000'; }
  async up(queryRunner) {
    await queryRunner.query('CREATE TABLE "plugin_widget" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "label" varchar NOT NULL)');
  }
  async down(queryRunner) {
    await queryRunner.query('DROP TABLE "plugin_widget"');
  }
}
module.exports = { CreateWidget1700000000000 };
`;

function writeMigrationPlugin(root: string, folder: string, name: string): void {
  const dir = join(root, folder);
  mkdirSync(join(dir, 'mig'), { recursive: true });
  writeFileSync(join(dir, 'mig', 'index.js'), MIGRATION_ENTRY, 'utf8');
  writeFileSync(
    join(dir, 'plugin.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      main: {
        frontend: { directory: 'frontend', entryPoint: 'index.mjs' },
        backend: { directory: 'dist', entryPoint: 'index.js' },
        migrations: { directory: 'mig', entryPoint: 'index.js' },
      },
      attraccessVersion: { min: '2.0.0-0' },
      persistence: { backends: ['sqlite'] },
      permissions: [],
    }),
  );
}

/** A plain-CommonJS migration creating and dropping one table, as a built plugin would ship it. */
const migration = (className: string, table: string, extra = '') => `
class ${className} {
  constructor() { this.name = '${className}'; }
  async up(queryRunner) {
    await queryRunner.query('CREATE TABLE "${table}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL)');
    ${extra}
  }
  async down(queryRunner) { await queryRunner.query('DROP TABLE "${table}"'); }
}`;

function writeMigrationEntry(root: string, folder: string, classes: string[]): void {
  writeFileSync(
    join(root, folder, 'mig', 'index.js'),
    `${classes.join('\n')}\nmodule.exports = { ${classes.map((c) => c.match(/class (\w+)/)?.[1]).join(', ')} };`,
    'utf8',
  );
}

async function tableExists(dbFile: string, table: string): Promise<boolean> {
  const probe = new DataSource({ type: 'sqlite', database: dbFile });
  await probe.initialize();
  try {
    const rows: unknown[] = await probe.query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [
      table,
    ]);
    return rows.length > 0;
  } finally {
    await probe.destroy();
  }
}

describe('PluginMigrationService', () => {
  let root: string;
  let dbFile: string;
  let manifest: LoadedPluginManifest;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-migration-'));
    dbFile = join(root, 'test.sqlite');
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    PluginMigrationService.configureForTesting({ type: 'sqlite', database: dbFile });

    writeMigrationPlugin(root, 'widgets', 'widgets');
    // getPlugins() rewrites the migrations directory to be plugin-folder relative
    // and assigns an id, mirroring real discovery.
    manifest = PluginService.getPlugins().find((p) => p.name === 'widgets') as LoadedPluginManifest;
  });

  afterEach(() => {
    PluginMigrationService.configureForTesting(null);
    rmSync(root, { recursive: true, force: true });
  });

  it('allows replacement only when the target retains every applied migration', async () => {
    await PluginMigrationService.assertReplacementMigrationHistory(manifest, root);
    await PluginMigrationService.runUpMigrations(manifest);
    await PluginMigrationService.assertReplacementMigrationHistory(manifest, root);
    const withoutMigrations = { ...manifest, main: { ...manifest.main, migrations: undefined } };
    await expect(PluginMigrationService.assertReplacementMigrationHistory(withoutMigrations, root)).rejects.toThrow(
      'does not contain applied migrations',
    );
    const replacement = join(root, 'replacement');
    mkdirSync(join(replacement, manifest.main.migrations.directory), { recursive: true });
    writeFileSync(
      join(replacement, manifest.main.migrations.directory, manifest.main.migrations.entryPoint),
      'module.exports = { Other1700000000001: class Other1700000000001 {} };',
    );
    await expect(PluginMigrationService.assertReplacementMigrationHistory(manifest, replacement)).rejects.toThrow(
      'CreateWidget1700000000000',
    );
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(true);
  });

  it('runs boot migrations while quarantining only the failing plugin', async () => {
    writeMigrationPlugin(root, 'broken', 'broken');
    writeFileSync(
      join(root, 'broken/mig/index.js'),
      'module.exports = { Broken1700000000001: class Broken1700000000001 { async up() { throw new Error("migration rejected"); } async down() {} } };',
    );
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(true);
    const broken = PluginService.getPlugins().find((plugin) => plugin.name === 'broken');
    expect(PluginService.isPluginQuarantined(broken)).toBe(true);
    expect(PluginService.isPluginQuarantined(manifest)).toBe(false);
    await PluginMigrationService.runPendingUpMigrationsForAllPlugins();
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(true);
  });

  it('discovers the migrations entry on the manifest', () => {
    expect(manifest).toBeDefined();
    expect(PluginMigrationService.hasMigrations(manifest)).toBe(true);
    expect(PluginMigrationService.migrationsTableName(manifest)).toBe('plugin_migrations_widgets');
  });

  it('runs up-migrations through the host runner and tracks them in a plugin-scoped table', async () => {
    const applied = await PluginMigrationService.runUpMigrations(manifest);

    expect(applied).toBe(1);
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(true);
    // Tracked separately from host migrations.
    expect(await tableExists(dbFile, 'plugin_migrations_widgets')).toBe(true);
    expect(await tableExists(dbFile, 'migrations')).toBe(false);
  });

  it('is idempotent — already-applied migrations are skipped on re-run', async () => {
    await PluginMigrationService.runUpMigrations(manifest);
    const secondRun = await PluginMigrationService.runUpMigrations(manifest);

    expect(secondRun).toBe(0);
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(true);
  });

  it('reverts migrations and drops the tracking table on down', async () => {
    await PluginMigrationService.runUpMigrations(manifest);

    const reverted = await PluginMigrationService.runDownMigrations(manifest);

    expect(reverted).toBe(1);
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(false);
    expect(await tableExists(dbFile, 'plugin_migrations_widgets')).toBe(false);
  });

  it('is a no-op for a plugin without a migrations entry', async () => {
    writeFileSync(
      join(root, 'widgets', 'plugin.json'),
      JSON.stringify({
        name: 'widgets',
        version: '1.0.0',
        main: {
          frontend: { directory: 'frontend', entryPoint: 'index.mjs' },
          backend: { directory: 'dist', entryPoint: 'index.js' },
        },
        attraccessVersion: { min: '2.0.0-0' },
        persistence: { backends: ['sqlite'] },
        permissions: [],
      }),
    );
    // Re-discover so the cached manifest is dropped.
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    const noMig = PluginService.getPlugins().find((p) => p.name === 'widgets') as LoadedPluginManifest;

    expect(PluginMigrationService.hasMigrations(noMig)).toBe(false);
    expect(await PluginMigrationService.runUpMigrations(noMig)).toBe(0);
  });

  describe('lifecycle on a real database', () => {
    const first = migration('CreateGadget1700000000001', 'plugin_gadget');
    const second = migration('CreateGizmo1700000000002', 'plugin_gizmo');
    const rows = async (table: string): Promise<{ name: string }[]> => {
      const probe = new DataSource({ type: 'sqlite', database: dbFile });
      await probe.initialize();
      try {
        return await probe.query(`SELECT name FROM "${table}" ORDER BY id`);
      } finally {
        await probe.destroy();
      }
    };
    const rediscover = (name: string) => {
      PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
      return PluginService.getPlugins().find((plugin) => plugin.name === name) as LoadedPluginManifest;
    };

    it('installs, upgrades and uninstalls with a plugin-scoped history', async () => {
      writeMigrationPlugin(root, 'gadgets', 'gadgets');
      writeMigrationEntry(root, 'gadgets', [first]);
      const installed = rediscover('gadgets');
      expect(await PluginMigrationService.runUpMigrations(installed)).toBe(1);
      expect(await tableExists(dbFile, 'plugin_gadget')).toBe(true);
      expect((await rows('plugin_migrations_gadgets')).map((row) => row.name)).toEqual(['CreateGadget1700000000001']);

      // The upgraded bundle keeps every applied migration and adds one: only the new one runs.
      writeMigrationEntry(root, 'gadgets', [first, second]);
      await PluginMigrationService.assertReplacementMigrationHistory(installed, root);
      expect(await PluginMigrationService.runUpMigrations(rediscover('gadgets'))).toBe(1);
      expect(await tableExists(dbFile, 'plugin_gizmo')).toBe(true);
      // The first plugin's history is independent of other plugins (the widgets fixture was never migrated).
      expect(await tableExists(dbFile, 'plugin_migrations_widgets')).toBe(false);

      // Uninstall reverts everything in reverse order and removes the tracking table.
      expect(await PluginMigrationService.runDownMigrations(rediscover('gadgets'))).toBe(2);
      expect(await tableExists(dbFile, 'plugin_gadget')).toBe(false);
      expect(await tableExists(dbFile, 'plugin_gizmo')).toBe(false);
      expect(await tableExists(dbFile, 'plugin_migrations_gadgets')).toBe(false);
    });

    it('blocks a replacement that drops an applied migration before anything changes', async () => {
      writeMigrationPlugin(root, 'gadgets', 'gadgets');
      writeMigrationEntry(root, 'gadgets', [first, second]);
      await PluginMigrationService.runUpMigrations(rediscover('gadgets'));
      const replacement = join(root, 'replacement');
      // The manifest's migrations directory is plugin-folder relative, so the replacement mirrors the layout.
      mkdirSync(join(replacement, 'gadgets', 'mig'), { recursive: true });
      writeMigrationEntry(replacement, 'gadgets', [second]);
      await expect(
        PluginMigrationService.assertReplacementMigrationHistory(rediscover('gadgets'), replacement),
      ).rejects.toThrow('CreateGadget1700000000001');
      expect((await rows('plugin_migrations_gadgets')).map((row) => row.name)).toHaveLength(2);
      expect(await tableExists(dbFile, 'plugin_gadget')).toBe(true);
    });

    it('rolls a failing batch back as a whole: no table and no history of the plugin stay behind', async () => {
      const failing = migration('Broken1700000000003', 'plugin_broken', "throw new Error('constraint exploded');");
      writeMigrationPlugin(root, 'gadgets', 'gadgets');
      writeMigrationEntry(root, 'gadgets', [first, failing]);
      const broken = rediscover('gadgets');
      await expect(PluginMigrationService.runUpMigrations(broken)).rejects.toThrow('constraint exploded');
      expect(await tableExists(dbFile, 'plugin_gadget')).toBe(false);
      expect(await tableExists(dbFile, 'plugin_broken')).toBe(false);
      expect((await rows('plugin_migrations_gadgets')).length).toBe(0);

      // After the plugin author ships a fix, the install succeeds from a clean state.
      writeMigrationEntry(root, 'gadgets', [first, second]);
      expect(await PluginMigrationService.runUpMigrations(rediscover('gadgets'))).toBe(2);
    });

    it('keeps the data and history of a failed uninstall revert so it can be retried', async () => {
      const stubborn = `
class Stubborn1700000000004 {
  constructor() { this.name = 'Stubborn1700000000004'; }
  async up(queryRunner) { await queryRunner.query('CREATE TABLE "plugin_stubborn" ("id" integer PRIMARY KEY)'); }
  async down() { throw new Error('cannot drop yet'); }
}`;
      writeMigrationPlugin(root, 'gadgets', 'gadgets');
      writeMigrationEntry(root, 'gadgets', [first, stubborn]);
      await PluginMigrationService.runUpMigrations(rediscover('gadgets'));
      await expect(PluginMigrationService.runDownMigrations(rediscover('gadgets'))).rejects.toThrow('cannot drop yet');
      // The revert is one transaction: the first migration was not reverted either, and the history is intact.
      expect(await tableExists(dbFile, 'plugin_gadget')).toBe(true);
      expect(await tableExists(dbFile, 'plugin_stubborn')).toBe(true);
      expect(await rows('plugin_migrations_gadgets')).toHaveLength(2);
    });

    it('does not touch the database for a plugin whose declared engines exclude the active one', async () => {
      writeMigrationPlugin(root, 'gadgets', 'gadgets');
      writeMigrationEntry(root, 'gadgets', [first]);
      const manifestPath = join(root, 'gadgets', 'plugin.json');
      const json = JSON.parse(readFileSync(manifestPath, 'utf8'));
      writeFileSync(manifestPath, JSON.stringify({ ...json, persistence: { backends: ['postgres'] } }));
      PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });

      expect(PluginService.getPlugins().find((plugin) => plugin.name === 'gadgets')).toBeUndefined();
      await PluginMigrationService.runPendingUpMigrationsForAllPlugins();
      // The widgets fixture of this suite migrates; the unsupported plugin does not.
      expect(await tableExists(dbFile, 'plugin_gadget')).toBe(false);
      expect(await tableExists(dbFile, 'plugin_migrations_gadgets')).toBe(false);
    });
  });
});

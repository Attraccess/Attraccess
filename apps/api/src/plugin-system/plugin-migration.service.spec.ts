import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
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
      attraccessVersion: { min: '1.0.0' },
      permissions: [],
    })
  );
}

async function tableExists(dbFile: string, table: string): Promise<boolean> {
  const probe = new DataSource({ type: 'sqlite', database: dbFile });
  await probe.initialize();
  try {
    const rows: unknown[] = await probe.query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [table]);
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
        attraccessVersion: { min: '1.0.0' },
        permissions: [],
      })
    );
    // Re-discover so the cached manifest is dropped.
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    const noMig = PluginService.getPlugins().find((p) => p.name === 'widgets') as LoadedPluginManifest;

    expect(PluginMigrationService.hasMigrations(noMig)).toBe(false);
    expect(await PluginMigrationService.runUpMigrations(noMig)).toBe(0);
  });
});

import { SqlitePluginMigrations } from './persistence/typeorm-adapter';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
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
    }),
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
    PluginMigrationService.configureForTesting(
      new SqlitePluginMigrations(() => root, { type: 'sqlite', database: dbFile }),
    );

    writeMigrationPlugin(root, 'widgets', 'widgets');
    // getPlugins() rewrites the migrations directory to be plugin-folder relative
    // and assigns an id, mirroring real discovery.
    manifest = PluginService.getPlugins().find((p) => p.name === 'widgets') as LoadedPluginManifest;
  });

  afterEach(() => {
    PluginMigrationService.configureForTesting(null);
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects unsupported plugin backends before schema loading, history reads or database creation', async () => {
    manifest.persistence = { contractVersion: 2, supportedBackends: ['postgres'] };
    // An entry that would execute immediately if support validation happened too late.
    writeFileSync(join(root, 'widgets/mig/index.js'), 'throw new Error("migration entry was evaluated")');
    await expect(PluginMigrationService.runUpMigrations(manifest)).rejects.toThrow(
      'does not support the selected database backend',
    );
    await expect(PluginMigrationService.runDownMigrations(manifest)).rejects.toThrow(
      'does not support the selected database backend',
    );
    await expect(PluginMigrationService.assertReplacementMigrationHistory(manifest, root)).rejects.toThrow(
      'does not support the selected database backend',
    );
    expect(existsSync(dbFile)).toBe(false);
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
        attraccessVersion: { min: '1.0.0' },
        permissions: [],
      }),
    );
    // Re-discover so the cached manifest is dropped.
    PluginService.configure({ PLUGIN_DIR: root, RESTART_BY_EXIT: true });
    const noMig = PluginService.getPlugins().find((p) => p.name === 'widgets') as LoadedPluginManifest;

    expect(PluginMigrationService.hasMigrations(noMig)).toBe(false);
    expect(await PluginMigrationService.runUpMigrations(noMig)).toBe(0);
  });

  it.each(
    ['declaration', 'duplicate adapters', 'invalid operation', 'invalid factory'].flatMap((failure) =>
      ['separate', 'registered'].map((mode) => [failure, mode]),
    ),
  )('rejects %s with %s migrations before history or database mutations', async (failure, mode) => {
    if (mode === 'registered') manifest.main.migrations = undefined;
    manifest.persistence = { contractVersion: 2, supportedBackends: ['sqlite'] };
    const backend = join(root, manifest.main.backend.directory, manifest.main.backend.entryPoint);
    mkdirSync(join(root, manifest.main.backend.directory), { recursive: true });
    const declaration = failure === 'declaration' ? "['postgres']" : "['sqlite']";
    const adapters =
      failure === 'duplicate adapters'
        ? "[{backend:'sqlite'}, {backend:'sqlite'}]"
        : failure === 'invalid operation'
          ? "[{backend:'sqlite', operations:[{token:{id:Symbol(), methods:[]},create(){return {};}}]}]"
          : failure === 'invalid factory'
            ? "[{backend:'sqlite', operations:[{token:{id:Symbol(), methods:['read']}}]}]"
            : '[]';
    writeFileSync(
      backend,
      `module.exports.default = {
      register() { return {}; },
      persistence: { contractVersion: 2, supportedBackends: ${declaration} }, persistenceAdapters: ${adapters}
    };`,
    );
    const migrations = new SqlitePluginMigrations(() => root, { type: 'sqlite', database: dbFile });
    expect(() => migrations.hasMigrations(manifest)).toThrow();
    expect(() => migrations.migrationNames(manifest)).toThrow();
    await expect(migrations.appliedNames(manifest)).rejects.toThrow();
    await expect(migrations.up(manifest)).rejects.toThrow();
    expect(existsSync(dbFile)).toBe(false);
    // An existing engine remains unchanged as well: no schema or history tables appear.
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(false);
    await expect(migrations.up(manifest)).rejects.toThrow();
    expect(await tableExists(dbFile, 'plugin_migrations_widgets')).toBe(false);
  });

  it('validates the replacement package before history reads and permits a legacy-to-v2 upgrade', async () => {
    await PluginMigrationService.runUpMigrations(manifest);
    const candidate = join(root, 'candidate');
    const backend = join(candidate, manifest.main.backend.directory, manifest.main.backend.entryPoint);
    mkdirSync(join(candidate, manifest.main.backend.directory), { recursive: true });
    mkdirSync(join(candidate, manifest.main.migrations.directory), { recursive: true });
    writeFileSync(
      join(candidate, manifest.main.migrations.directory, manifest.main.migrations.entryPoint),
      MIGRATION_ENTRY,
    );
    const replacement = { ...manifest, persistence: { contractVersion: 2 as const, supportedBackends: ['sqlite'] } };
    writeFileSync(
      backend,
      `module.exports.default = { register(){return {};}, persistence:{contractVersion:2,supportedBackends:['sqlite']} };`,
    );
    // The installed legacy package has no neutral backend export; only the candidate does.
    expect(existsSync(join(root, manifest.main.backend.directory, manifest.main.backend.entryPoint))).toBe(false);
    await PluginMigrationService.assertReplacementMigrationHistory(replacement, candidate);
    writeFileSync(
      backend,
      `module.exports.default = { register(){return {};}, persistence:{contractVersion:2,supportedBackends:['postgres']} };`,
    );
    await expect(PluginMigrationService.assertReplacementMigrationHistory(replacement, candidate)).rejects.toThrow(
      'does not support',
    );
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(true);
  });

  it('runs adapter-registered migrations with the same durable history, replacement and uninstall checks', async () => {
    manifest.persistence = { contractVersion: 2, supportedBackends: ['sqlite'] };
    manifest.main.migrations = undefined;
    const backend = join(root, manifest.main.backend.directory, manifest.main.backend.entryPoint);
    mkdirSync(join(root, manifest.main.backend.directory), { recursive: true });
    writeFileSync(
      backend,
      MIGRATION_ENTRY +
        `
      module.exports.default = {
        register() { return {}; },
      persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
        persistenceAdapters: [{ backend: 'sqlite', migrations: [CreateWidget1700000000000] }]
      };
    `,
    );
    expect(PluginMigrationService.hasMigrations(manifest)).toBe(true);
    expect(await PluginMigrationService.runUpMigrations(manifest)).toBe(1);
    expect(await PluginMigrationService.runUpMigrations(manifest)).toBe(0);
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(true);
    await PluginMigrationService.assertReplacementMigrationHistory(manifest, root);
    writeFileSync(
      backend,
      `module.exports.default = {
      register() { return {}; },
      persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
      persistenceAdapters: [{ backend: 'sqlite', migrations: [] }]
    };`,
    );
    await expect(PluginMigrationService.assertReplacementMigrationHistory(manifest, root)).rejects.toThrow(
      'CreateWidget1700000000000',
    );
    // Restore the released class before uninstall; replacement rejection retains the database.
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(true);
    writeFileSync(
      backend,
      MIGRATION_ENTRY +
        `module.exports.default = {
      register() { return {}; },
      persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
      persistenceAdapters: [{ backend: 'sqlite', migrations: [CreateWidget1700000000000] }]
    };`,
    );
    expect(await PluginMigrationService.runDownMigrations(manifest)).toBe(1);
    expect(await tableExists(dbFile, 'plugin_widget')).toBe(false);
    expect(await tableExists(dbFile, 'plugin_migrations_widgets')).toBe(false);
  });

  it('rejects unsupported adapter migrations before evaluating backend code or creating a database', async () => {
    manifest.persistence = { contractVersion: 2, supportedBackends: ['postgres'] };
    manifest.main.migrations = undefined;
    const backend = join(root, manifest.main.backend.directory, manifest.main.backend.entryPoint);
    mkdirSync(join(root, manifest.main.backend.directory), { recursive: true });
    writeFileSync(backend, 'throw new Error("backend entry was evaluated")');
    expect(() => PluginMigrationService.hasMigrations(manifest)).toThrow('does not support');
    await expect(PluginMigrationService.runUpMigrations(manifest)).rejects.toThrow('does not support');
    await expect(PluginMigrationService.runDownMigrations(manifest)).rejects.toThrow('does not support');
    await expect(PluginMigrationService.assertReplacementMigrationHistory(manifest, root)).rejects.toThrow(
      'does not support',
    );
    expect(existsSync(dbFile)).toBe(false);
  });
});

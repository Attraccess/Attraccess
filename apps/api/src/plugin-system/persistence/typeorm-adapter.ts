import type { PluginHostOperations } from '@attraccess/plugins-backend-sdk/v2';
import { Resource, ResourceFlowNode, Setting, User } from '@attraccess/database-entities';
import { DataSource, DataSourceOptions, In, MigrationExecutor } from 'typeorm';
import type { PluginMigrationClass } from '@attraccess/plugins-backend-sdk/adapter';
import type { PluginBackendAdapters } from '@attraccess/plugins-backend-sdk/adapter';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { resolveBackendConfig } from '../../database/backend.config';
import { selectDatabaseBackend } from '../../database/backend.registry';
import type { LoadedPluginManifest } from '../plugin.manifest';
import { loadPluginEntryExports } from '../runtime/module-loader';
import { assertPluginBackendSupport, PluginMigrationPersistence } from './port';

/** Read-only host projections. Permission checks run before invoking these operations. */
export class SqlitePluginHostOperations implements PluginHostOperations {
  constructor(private readonly source: () => DataSource) {}

  readonly users: PluginHostOperations['users'] = {
    list: async ({ limit }) => {
      if (!Number.isInteger(limit) || limit < 1 || limit > 5) {
        throw new Error('User listing limit must be an integer from 1 to 5.');
      }
      const users = await this.source()
        .getRepository(User)
        .find({ select: { id: true, username: true }, take: limit });
      return users.map(({ id, username }) => ({ id, username }));
    },
  };

  readonly resources: PluginHostOperations['resources'] = {
    findById: async (id) => {
      const resource = await this.source().getRepository(Resource).findOneBy({ id });
      return resource ? { ...resource } : null;
    },
  };

  readonly flows: PluginHostOperations['flows'] = {
    findReferences: async ({ nodeTypes }) => {
      if (!nodeTypes.length) return [];
      const nodes = await this.source()
        .getRepository(ResourceFlowNode)
        .find({ where: { type: In([...nodeTypes]) } });
      return nodes.map((node) => ({ ...node }));
    },
  };

  readonly settings: PluginHostOperations['settings'] = {
    findByKey: async ({ parent, key }) => {
      const setting = await this.source().getRepository(Setting).findOneBy({ parent, key });
      return setting?.value ?? null;
    },
  };
}

/** Owns SQLite connections, class loading and released plugin migration-table semantics. */
export class SqlitePluginMigrations implements PluginMigrationPersistence {
  readonly backend = 'sqlite';
  constructor(
    private readonly root: () => string,
    private readonly configuration: { readonly type: 'sqlite'; readonly database: string } | null = null,
  ) {}

  tableName(manifest: { readonly name: string }): string {
    return `plugin_migrations_${manifest.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  }

  hasMigrations(manifest: LoadedPluginManifest): boolean {
    this.assertSupported(manifest);
    if (manifest.main?.migrations?.directory && manifest.main?.migrations?.entryPoint) return true;
    return this.classes(manifest).length > 0;
  }

  migrationNames(manifest: LoadedPluginManifest, root = this.root()): readonly string[] {
    return this.classes(manifest, root).map(({ name }) => name);
  }

  async appliedNames(manifest: LoadedPluginManifest): Promise<readonly string[]> {
    return this.connection(manifest, [], async (source) =>
      (await new MigrationExecutor(source).getExecutedMigrations()).map(({ name }) => name),
    );
  }

  async up(manifest: LoadedPluginManifest): Promise<readonly string[]> {
    const classes = this.classes(manifest);
    if (!classes.length) return [];
    return this.connection(manifest, classes, async (source) =>
      (await source.runMigrations({ transaction: 'all' })).map(({ name }) => name),
    );
  }

  async down(manifest: LoadedPluginManifest): Promise<number> {
    if (!this.hasMigrations(manifest)) return 0;
    return this.connection(manifest, this.classes(manifest), async (source) => {
      const executed = await new MigrationExecutor(source).getExecutedMigrations();
      for (let i = 0; i < executed.length; i++) await source.undoLastMigration({ transaction: 'all' });
      await source.query(`DROP TABLE IF EXISTS "${this.tableName(manifest)}"`);
      return executed.length;
    });
  }

  private assertSupported(manifest: LoadedPluginManifest): void {
    assertPluginBackendSupport(manifest, this.configuration?.type ?? resolveBackendConfig().type);
  }

  private classes(manifest: LoadedPluginManifest, root = this.root()): PluginMigrationClass[] {
    this.assertSupported(manifest);
    const migrations = manifest.main?.migrations;
    if (migrations?.directory && migrations.entryPoint) {
      const entry = join(root, migrations.directory, migrations.entryPoint);
      const exported = loadPluginEntryExports(entry);
      const candidates = Array.isArray(exported.default) ? exported.default : Object.values(exported);
      const classes = candidates.filter((value): value is PluginMigrationClass => typeof value === 'function');
      if (!classes.length)
        throw new Error(`Plugin "${manifest.name}" migrations entry "${entry}" exported no migration classes.`);
      // Released entry points remain authoritative when both forms are declared.
      return classes;
    }
    if (!manifest.persistence || !manifest.main.backend?.directory || !manifest.main.backend.entryPoint) return [];
    const entry = join(root, manifest.main.backend.directory, manifest.main.backend.entryPoint);
    const plugin = loadPluginEntryExports(entry).default as Partial<PluginBackendAdapters> & {
      persistence?: import('@attraccess/plugins-backend-sdk/v2').PluginPersistenceDeclaration;
    };
    assertPluginBackendSupport({ name: manifest.name, persistence: plugin?.persistence }, this.backend);
    if (
      !plugin?.persistence ||
      JSON.stringify([...plugin.persistence.supportedBackends].sort()) !==
        JSON.stringify([...manifest.persistence.supportedBackends].sort())
    ) {
      throw new Error(`Plugin "${manifest.name}" exports a persistence contract inconsistent with its manifest.`);
    }
    const registrations = (plugin.persistenceAdapters ?? []).filter(({ backend }) => backend === this.backend);
    if (registrations.length > 1) throw new Error(`Plugin "${manifest.name}" has duplicate SQLite registrations.`);
    const classes = [...(registrations[0]?.migrations ?? [])];
    if (classes.some((value) => typeof value !== 'function'))
      throw new Error('Plugin migration registrations must contain classes.');
    return classes;
  }

  private async connection<T>(
    manifest: LoadedPluginManifest,
    migrations: PluginMigrationClass[],
    work: (source: DataSource) => Promise<T>,
  ): Promise<T> {
    this.assertSupported(manifest);
    const base = (this.configuration ?? selectDatabaseBackend().connectionOptions()) as DataSourceOptions;
    const database = (base as { database?: unknown }).database;
    if (typeof database === 'string') mkdirSync(dirname(database), { recursive: true });
    const source = new DataSource({
      ...base,
      entities: [],
      synchronize: false,
      migrationsRun: false,
      migrations,
      migrationsTableName: this.tableName(manifest),
    } as DataSourceOptions);
    await source.initialize();
    try {
      await source.query('PRAGMA busy_timeout = 5000');
      return await work(source);
    } finally {
      await source.destroy();
    }
  }
}

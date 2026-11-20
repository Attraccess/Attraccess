import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as root from '../index';
import { PluginPermission, PLUGIN_PERMISSION_DESCRIPTIONS, isPluginPermission } from './plugin.interface';

const PACKAGE_ROOT = join(__dirname, '..', '..');
const SRC = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>;
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** Names that would hand a plugin the database: an ORM, a driver, an engine, entities or connection handles. */
const DATABASE_NAME =
  /typeorm|sqlite|postgres|mysql|knex|driver|engine|entit(?:y|ies)|EntityManager|DataSource|QueryRunner|QueryBuilder|Repository|Migration(?:Interface|Class)|PLUGIN_ENGINE/i;
/** Modules a plugin must never be able to load through the SDK. */
const DATABASE_MODULE =
  /^(?:typeorm|@nestjs\/typeorm|sqlite3|better-sqlite3|pg|mysql2|knex|@attraccess\/database-entities)(?:\/|$)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !/\.(?:spec|test|fixtures)\.ts$|\.test-cases\.ts$/.test(path) ? [path] : [];
  });
}

/** Files that are part of the published surface: everything but the host-internal entry and its building blocks. */
const publishedFiles = () =>
  sourceFiles(SRC).filter(
    (file) => !/(?:^|\/)internal\.ts$|plugin-ble-(?:session|watch)-engine\.ts$|in-memory-storage\//.test(file),
  );

describe('plugin SDK 2.0 published surface', () => {
  it('exports no ORM, driver, engine, entity or connection name from the root', () => {
    expect(Object.keys(root).filter((name) => DATABASE_NAME.test(name))).toEqual([]);
  });

  it('declares no exported type, class or function with such a name', () => {
    const offenders = publishedFiles().flatMap((file) =>
      [
        ...readFileSync(file, 'utf8').matchAll(
          /^export (?:declare )?(?:abstract )?(?:interface|type|class|const|function|enum) (\w+)/gm,
        ),
      ]
        .map((match) => match[1])
        .filter((name) => DATABASE_NAME.test(name))
        .map((name) => `${file}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it('exports none of the removed helpers', () => {
    const names = Object.keys(root);
    for (const removed of [
      'Entity',
      'Column',
      'PrimaryColumn',
      'PrimaryGeneratedColumn',
      'Index',
      'Unique',
      'Table',
      'TableColumn',
      'TableForeignKey',
      'TableIndex',
      'sqlitePersistence',
      'createSqlitePluginPersistence',
      'createHostTransactionScope',
      'managerOfTransactionScope',
      'PLUGIN_ENGINE_ACCESS',
      'PLUGIN_PERSISTENCE_BACKENDS',
      'PluginPersistenceBackendError',
      'isPluginPersistenceBackend',
      'declaredPersistenceBackends',
      'entities',
      'User',
      'Resource',
      'Setting',
      'NFCCard',
      'ResourceFlowNode',
    ]) {
      expect(names).not.toContain(removed);
    }
  });

  it('imports no ORM, driver or host entity module in any source file', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\(\s*|require\(\s*)'([^']+)'/g)]
        .map((match) => match[1])
        .filter((specifier) => DATABASE_MODULE.test(specifier))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('publishes only the package root and package.json, and has no ORM dependency', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './package.json']);
    const declared = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.peerDependencies ?? {})];
    expect(declared.filter((name) => DATABASE_MODULE.test(`${name}/`))).toEqual([]);
    expect(declared).not.toContain('typeorm');
  });

  it('exposes the record port, the transaction surface and the neutral models', () => {
    for (const name of [
      'definePluginStorage',
      'table',
      'f',
      'step',
      'increment',
      'PluginStorageError',
      'PluginStorageUniqueViolation',
      'PluginStorageConflict',
      'PluginStorageNotFound',
      'PluginStorageInvalid',
      'createInMemoryPluginStorage',
    ]) {
      expect(root).toHaveProperty(name);
    }
    // Neutral models are plain types of @attraccess/application-models; the enums they use are re-exported.
    expect(root.SupervisionMode).toBeDefined();
  });

  it('gates storage with PLUGIN_STORAGE and no longer knows DATABASE_ACCESS', () => {
    expect(PluginPermission.PLUGIN_STORAGE).toBe('PLUGIN_STORAGE');
    expect(Object.values(PluginPermission)).not.toContain('DATABASE_ACCESS');
    expect(PLUGIN_PERMISSION_DESCRIPTIONS[PluginPermission.PLUGIN_STORAGE]).toMatch(/own/);
    expect(isPluginPermission('PLUGIN_STORAGE')).toBe(true);
    expect(isPluginPermission('DATABASE_ACCESS')).toBe(false);
  });
});

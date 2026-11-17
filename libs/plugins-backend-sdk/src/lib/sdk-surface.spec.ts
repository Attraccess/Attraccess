import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as root from '../index';
import * as sqlite from '../sqlite';
import {
  declaredPersistenceBackends,
  isPluginPersistenceBackend,
  PLUGIN_PERSISTENCE_BACKENDS,
} from './plugin-persistence';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('plugin SDK 2.0 surface', () => {
  it('exports no TypeORM, entity or migration helper from the root', () => {
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

  it('keeps TypeORM and host entities out of every source file except the explicit sqlite subpath', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.includes(`${join('lib', 'sqlite')}`) && !file.endsWith(`${join('src', 'sqlite.ts')}`))
      .filter((file) => /from\s+'(?:typeorm|@attraccess\/database-entities)/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('exposes the neutral persistence model and the host models from the root', () => {
    expect(root.PLUGIN_ENGINE_ACCESS).toBe(Symbol.for('attraccess.plugin.persistence.engineAccess'));
    expect(root.PLUGIN_PERSISTENCE_BACKENDS).toEqual(['sqlite']);
    expect(typeof root.PluginPersistenceBackendError).toBe('function');
    // Neutral models are plain types of @attraccess/application-models; the enums they use are re-exported.
    expect(root.SupervisionMode).toBeDefined();
  });

  it('puts the engine-specific surface behind the sqlite subpath', () => {
    for (const exported of [
      'Entity',
      'Column',
      'PrimaryGeneratedColumn',
      'Table',
      'TableColumn',
      'sqlitePersistence',
      'createSqlitePluginPersistence',
      'createHostTransactionScope',
    ]) {
      expect(Object.keys(sqlite)).toContain(exported);
    }
  });

  it('knows the supported engines and reads a plugin declaration', () => {
    expect(PLUGIN_PERSISTENCE_BACKENDS).toEqual(['sqlite']);
    expect(isPluginPersistenceBackend('sqlite')).toBe(true);
    expect(isPluginPersistenceBackend('postgres')).toBe(false);
    expect(declaredPersistenceBackends(undefined)).toEqual([]);
    expect(declaredPersistenceBackends({ sqlite: { entities: [] } })).toEqual(['sqlite']);
    expect(declaredPersistenceBackends({ sqlite: undefined })).toEqual([]);
  });
});

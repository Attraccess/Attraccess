import { definePluginStorage, f, PluginPermission, step, table } from '@attraccess/plugins-backend-sdk';
import {
  assertDistinctNamespace,
  assertInstallableNamespace,
  compileModuleStorage,
  storagePluginNames,
} from './storage-loader';
import { claimStorageNames, releaseStorageNames } from './storage-registry';

const things = table({ id: f.id() });
const storage = definePluginStorage({
  tables: { things },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('things', things)] }],
});
const withStorage = (name: string) => ({ name, permissions: [PluginPermission.PLUGIN_STORAGE] });

describe('storage namespaces of installed plugins', () => {
  afterEach(() => ['demo', 'demo-extra'].forEach(releaseStorageNames));

  it.each(['foo_bar', 'Foo.Bar', 'FOO-BAR'])('refuses %s beside the installed plugin foo-bar', (name) => {
    expect(() => assertDistinctNamespace(name, ['foo-bar', 'other'])).toThrow(
      new RegExp(
        `Plugin "${name.replace('.', '\\.')}" .*namespace "foo_bar" is the one of the installed plugin "foo-bar"`,
      ),
    );
  });

  it('treats another release of the same plugin, and names without a namespace, as no conflict', () => {
    expect(() => assertDistinctNamespace('foo-bar', ['foo-bar', '---'])).not.toThrow();
    expect(() => assertDistinctNamespace('---', ['foo-bar'])).not.toThrow();
  });

  it('compiles no declaration that shares its namespace with another installed plugin', () => {
    expect(() => compileModuleStorage(withStorage('foo_bar'), { storage }, ['foo-bar'])).toThrow(
      /namespace "foo_bar" is the one of the installed plugin "foo-bar"/,
    );
    expect(compileModuleStorage(withStorage('foo_bar'), { storage }, ['foo_bar'])?.namespace).toBe('foo_bar');
  });

  it('counts only plugins that request PLUGIN_STORAGE', () => {
    expect(storagePluginNames([withStorage('a'), { name: 'b', permissions: [] }, { name: 'c' }])).toEqual(['a']);
  });

  it('refuses an install whose namespace another plugin with storage has, or keeps a table in', () => {
    const installed = [withStorage('foo-bar'), { name: 'plain', permissions: [] }];
    expect(() => assertInstallableNamespace(withStorage('foo_bar'), () => installed)).toThrow(/"foo-bar"/);
    expect(() => assertInstallableNamespace(withStorage('Plain'), () => installed)).not.toThrow();
    // A plugin without storage claims nothing.
    expect(() => assertInstallableNamespace({ name: 'foo_bar', permissions: [] }, () => installed)).not.toThrow();

    const demo = compileModuleStorage(
      withStorage('demo'),
      {
        storage: definePluginStorage({
          tables: { extraX: things },
          migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('extraX', things)] }],
        }),
      },
      [],
    );
    claimStorageNames(demo as NonNullable<typeof demo>);
    expect(() => assertInstallableNamespace(withStorage('demo-extra'), () => [withStorage('demo')])).toThrow(
      /Plugin "demo-extra" .*plugin "demo" keeps the table "plugin_demo_extra_x"/,
    );
  });
});

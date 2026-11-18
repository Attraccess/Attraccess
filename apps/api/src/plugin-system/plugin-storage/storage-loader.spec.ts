import { definePluginStorage, f, PluginPermission, step, table } from '@attraccess/plugins-backend-sdk';
import {
  assertDistinctNamespace,
  assertInstallableNamespace,
  compileModuleStorage,
  storagePluginNames,
} from './storage-loader';
import { namespacesOverlap } from './storage-namespace';
import { recordEstablishedStorage } from './storage-precedence';
import { claimStorageNames, releaseStorageNames } from './storage-registry';

const things = table({ id: f.id() });
const storage = definePluginStorage({
  tables: { things },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('things', things)] }],
});
const withStorage = (name: string) => ({ name, permissions: [PluginPermission.PLUGIN_STORAGE] });
const controllers = table({ id: f.id() });
/** Declares `plugin_<namespace>_controllers`, which lies in the namespace of `plugin-<name>` too. */
const controllerStorage = definePluginStorage({
  tables: { controllers },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('controllers', controllers)] }],
});

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
    // A loaded plugin's claims are checked too, even when its manifest is no longer listed.
    expect(() => assertInstallableNamespace(withStorage('demo-extra'), () => [])).toThrow(
      /Plugin "demo-extra" .*plugin "demo" keeps the table "plugin_demo_extra_x"/,
    );
  });

  it.each([
    ['plugin-wago', 'wago', 'plugin_wago', 'wago'],
    ['wago', 'plugin-wago', 'wago', 'plugin_wago'],
    ['plugin-matter', 'matter', 'plugin_matter', 'matter'],
    ['demo-extra', 'demo', 'demo_extra', 'demo'],
    ['demo', 'demo-extra', 'demo', 'demo_extra'],
  ])('refuses installing %s beside the installed (not loaded) plugin %s by name alone', (name, other, own, theirs) => {
    expect(() => assertInstallableNamespace(withStorage(name), () => [withStorage(other)])).toThrow(
      `Plugin "${name}" storage declaration is invalid: its storage namespace "${own}" overlaps the namespace ` +
        `"${theirs}" of the installed plugin "${other}"`,
    );
  });

  it('installs updates of the same plugin, and plugins whose namespaces only share a leading text', () => {
    const installed = () => [withStorage('wago'), withStorage('demo'), withStorage('plugin-matter')];
    for (const name of ['wago', 'demo', 'plugin-matter', 'wagon', 'demolition', 'mattermost']) {
      expect(() => assertInstallableNamespace(withStorage(name), installed)).not.toThrow();
    }
  });
});

describe('namespacesOverlap', () => {
  it.each([
    ['wago', 'wago', true],
    ['wago', 'plugin_wago', true],
    ['demo', 'demo_extra', true],
    ['demo', 'plugin_demo_x', true],
    ['wago', 'wagon', false],
    ['demo', 'demolition', false],
    ['matter', 'plugin_matter_x', true],
    ['matter', 'mattermost', false],
  ])('%s and %s: %s', (a, b, expected) => {
    expect(namespacesOverlap(a, b)).toBe(expected);
    expect(namespacesOverlap(b, a)).toBe(expected);
  });
});

describe('storage precedence at boot', () => {
  afterEach(() => recordEstablishedStorage([]));
  const installed = ['wago', 'plugin-wago'];
  const compile = (name: string) => () =>
    compileModuleStorage(withStorage(name), { storage: controllerStorage }, installed);

  it('keeps an established plugin beside a newcomer and refuses the newcomer', () => {
    recordEstablishedStorage(['wago']);
    expect(compile('wago')()?.namespace).toBe('wago');
    expect(compile('plugin-wago')).toThrow(
      /namespace "plugin_wago" overlaps the namespace "wago" of the installed plugin "wago", which already keeps data/,
    );
  });

  it('refuses a newcomer by name alone, whatever its own tables', () => {
    recordEstablishedStorage(['demo']);
    expect(() => compileModuleStorage(withStorage('demo-extra'), { storage }, ['demo', 'demo-extra'])).toThrow(
      /namespace "demo_extra" overlaps the namespace "demo" of the installed plugin "demo"/,
    );
  });

  it.each([
    ['neither', []],
    ['both', ['wago', 'plugin-wago']],
  ])('checks both against each other when %s is established', (_label, established) => {
    recordEstablishedStorage(established);
    expect(compile('wago')).toThrow(
      /table name "plugin_wago_controllers" lies in the storage namespace "plugin_wago" of another installed plugin/,
    );
    expect(compile('plugin-wago')()?.namespace).toBe('plugin_wago');
  });

  it('refuses both established plugins that share a namespace (they share one bookkeeping)', () => {
    recordEstablishedStorage(['foo-bar', 'foo_bar']);
    for (const name of ['foo-bar', 'foo_bar']) {
      expect(() => compileModuleStorage(withStorage(name), { storage }, ['foo-bar', 'foo_bar'])).toThrow(
        /is the one of the installed plugin/,
      );
    }
  });
});

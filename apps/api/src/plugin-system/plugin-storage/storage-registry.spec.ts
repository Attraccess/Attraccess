import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from './storage-schema';
import {
  assertNamespaceUnclaimed,
  assertStorageNamesFree,
  claimStorageNames,
  releaseStorageNames,
} from './storage-registry';

const LEGACY = { legacyMigrations: ['Create1700000000000'] };

/** A plugin with one table; `physicalName` adopts a 1.x name (allowed only with adoption, so it then adopts). */
function storageOf(pluginName: string, logical: string, physicalName?: string) {
  const things = table({ id: f.id(), name: f.string() }, physicalName ? { physicalName } : {});
  return compilePluginStorage(
    pluginName,
    definePluginStorage({
      tables: { [logical]: things },
      migrations: [{ version: 1, name: 'baseline', steps: [step.createTable(logical, things)] }],
      ...(physicalName ? { adoption: LEGACY } : {}),
    }),
    { reservedTables: new Set() },
  );
}

describe('storage name claims', () => {
  const plugins = ['demo', 'demo-extra', 'foo-bar', 'foo_bar', 'reservations', 'reservations-ical', 'wago', 'plugin'];
  afterEach(() => plugins.forEach(releaseStorageNames));

  it('lets a new release of the same plugin claim again', () => {
    claimStorageNames(storageOf('demo', 'items'));
    expect(() => claimStorageNames(storageOf('demo', 'items'))).not.toThrow();
    expect(() => assertStorageNamesFree(storageOf('demo', 'other'))).not.toThrow();
  });

  it('refuses a second plugin with the same namespace, naming both', () => {
    claimStorageNames(storageOf('foo-bar', 'items'));
    expect(() => claimStorageNames(storageOf('foo_bar', 'other'))).toThrow(
      /Plugin "foo_bar" storage declaration is invalid: its storage namespace "foo_bar" is the one of plugin "foo-bar"/,
    );
    expect(() => assertNamespaceUnclaimed('Foo.Bar', 'foo_bar')).toThrow(/plugin "foo-bar"/);
  });

  it('refuses a name another plugin already holds', () => {
    claimStorageNames(storageOf('reservations', 'feed', 'reservations_ical_feed'));
    // reservations-ical's own namespace contains the name, so only the existing claim tells the two apart.
    const intruder = storageOf('reservations-ical', 'feed', 'reservations_ical_feed');
    expect(() => claimStorageNames(intruder)).toThrow(
      /the table "reservations_ical_feed" already belongs to plugin "reservations"/,
    );
  });

  it('refuses, in either install order, a plugin while the other keeps a name inside its namespace', () => {
    // "demo" keeps plugin_demo_extra_x (logical extraX); "demo-extra" owns the prefix plugin_demo_extra_.
    claimStorageNames(storageOf('demo', 'extraX'));
    expect(() => claimStorageNames(storageOf('demo-extra', 'notes'))).toThrow(
      /plugin "demo" keeps the table "plugin_demo_extra_x" inside this plugin's storage namespace "demo_extra"/,
    );
    expect(() => assertNamespaceUnclaimed('demo-extra', 'demo_extra')).toThrow(/plugin "demo" keeps the table/);
    releaseStorageNames('demo');

    claimStorageNames(storageOf('demo-extra', 'notes'));
    expect(() => claimStorageNames(storageOf('demo', 'extraX'))).toThrow(
      /the table "plugin_demo_extra_x" lies in the storage namespace "demo_extra" of plugin "demo-extra"/,
    );
  });

  it('keeps plugins whose namespaces only share a prefix apart', () => {
    claimStorageNames(storageOf('wago', 'controllers', 'plugin_wago_controllers'));
    claimStorageNames(storageOf('plugin', 'items'));
    claimStorageNames(storageOf('demo', 'items'));
    expect(() => claimStorageNames(storageOf('demo-extra', 'notes'))).not.toThrow();
    expect(() => assertNamespaceUnclaimed('reservations', 'reservations')).not.toThrow();
  });

  it('refuses a plugin that adopts a name inside the namespace of a plugin that claimed it', () => {
    claimStorageNames(storageOf('wago', 'controllers', 'plugin_wago_controllers'));
    expect(() => claimStorageNames(storageOf('plugin', 'controllers', 'plugin_wago_controllers'))).toThrow(
      /the table "plugin_wago_controllers" (already belongs to|lies in the storage namespace "wago" of) plugin "wago"/,
    );
  });
});

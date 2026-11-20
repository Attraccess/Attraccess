import { describeMissingPluginData, groupByPlugin, pluginOfTable } from './missing-plugin-tables';

describe('missing plugin tables', () => {
  describe('pluginOfTable', () => {
    it.each([
      ['plugin_storage_migrations_bookings', 'bookings'],
      ['plugin_migrations_bookings', 'bookings'],
      ['plugin_migrations_Bookings', 'bookings'],
      // 1.x npm-installed plugins: the history is named after the package, the data after the plugin.
      ['plugin_migrations__attraccess_plugin_wago', 'wago'],
      ['plugin_wago_controllers', 'wago'],
      ['plugin_bookings', 'bookings'],
    ])('%s belongs to plugin %s', (table, plugin) => {
      expect(pluginOfTable(table)).toBe(plugin);
    });

    it('prefers the longest namespace a history table names', () => {
      expect(pluginOfTable('plugin_fab_reader_cards', ['fab', 'fab_reader'])).toBe('fab_reader');
      expect(pluginOfTable('plugin_fab_reader_cards')).toBe('fab');
    });

    it('maps a table outside the plugin naming to no plugin', () => {
      expect(pluginOfTable('legacy_notes')).toBeUndefined();
      expect(pluginOfTable('plugin_')).toBeUndefined();
    });
  });

  it('groups the tables of each plugin, including a 1.x npm history, and keeps the rest apart', () => {
    const grouped = groupByPlugin([
      { name: 'plugin_migrations__attraccess_plugin_wago', rows: 3 },
      { name: 'plugin_wago_controllers', rows: 12 },
      { name: 'plugin_fab_reader_cards', rows: 1 },
      { name: 'plugin_migrations_fab_reader', rows: 2 },
      { name: 'legacy_notes', rows: 4 },
    ]);
    expect([...grouped.plugins.keys()]).toEqual(['wago', 'fab_reader']);
    expect(grouped.plugins.get('wago')?.map((table) => table.name)).toEqual([
      'plugin_migrations__attraccess_plugin_wago',
      'plugin_wago_controllers',
    ]);
    expect(grouped.other).toEqual([{ name: 'legacy_notes', rows: 4 }]);
  });

  describe('describeMissingPluginData', () => {
    it('names one plugin with each of its tables and row counts', () => {
      expect(describeMissingPluginData([{ name: 'plugin_wago_controllers', rows: 1 }], [])).toBe(
        'the SQLite data holds data of a plugin that is not installed or not loadable: plugin "wago" ' +
          "(plugin_wago_controllers: 1 row). Nothing was imported. Install that plugin's build for this Attraccess " +
          'version in the plugin directory first',
      );
    });

    it('lists every plugin, the tables of no plugin, and the plugins that could not be loaded', () => {
      const message = describeMissingPluginData(
        [
          { name: 'plugin_wago_controllers', rows: 12 },
          { name: 'plugin_bookings_booking', rows: 2 },
          { name: 'legacy_notes', rows: 4 },
        ],
        [{ name: 'bookings', reason: 'broken declaration' }],
      );
      expect(message).toBe(
        'the SQLite data holds data of plugins that are not installed or not loadable: plugin "wago" ' +
          '(plugin_wago_controllers: 12 rows); plugin "bookings" (plugin_bookings_booking: 2 rows), and tables not ' +
          'from any installed plugin: legacy_notes: 4 rows. Nothing was imported. Install the build for this ' +
          'Attraccess version of every plugin these tables belong to in the plugin directory first; plugins that ' +
          'could not be loaded: bookings (broken declaration)',
      );
    });
  });
});

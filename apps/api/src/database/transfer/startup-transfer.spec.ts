import { PluginMigrationService } from '../../plugin-system/plugin-migration.service';
import type { LoadedPluginManifest } from '../../plugin-system/plugin.manifest';
import type { CompiledPluginStorage } from '../../plugin-system/plugin-storage/storage-model';
import { MissingTargetStorageError } from '../postgres/postgres-transfer';
import { SnapshotIncompatibleError } from '../transfer-snapshot';
import { discoverStoragePlugins, explainMissingPlugin, postgresHasUserData } from './startup-transfer';
import { SqliteTransferError } from './transfer-errors';

const manifest = (name: string, version = '1.0.0') => ({ name, version }) as unknown as LoadedPluginManifest;
const storage = (namespace: string) => ({ namespace }) as unknown as CompiledPluginStorage;

describe('startup transfer helpers', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('postgresHasUserData', () => {
    const database = (tables: string[], rowsOf: Record<string, number>) => ({
      query: jest.fn(async (sql: string) => {
        if (sql.includes('information_schema.tables')) return tables.map((table_name) => ({ table_name }));
        const table = /FROM "(\w+)"/.exec(sql)?.[1] as string;
        return Array.from({ length: rowsOf[table] ?? 0 }, () => ({ '?column?': 1 }));
      }),
    });

    it('is false for a freshly applied baseline: no user and no resource', async () => {
      expect(await postgresHasUserData(database(['user', 'resource'], {}))).toBe(false);
    });

    it('is true as soon as a user or a resource exists', async () => {
      expect(await postgresHasUserData(database(['user', 'resource'], { user: 1 }))).toBe(true);
      expect(await postgresHasUserData(database(['user', 'resource'], { resource: 3 }))).toBe(true);
    });

    it('is false for a database without the tables yet', async () => {
      expect(await postgresHasUserData(database([], {}))).toBe(false);
    });
  });

  describe('discoverStoragePlugins', () => {
    it('describes the plugins with declared storage and skips the ones without', () => {
      jest.spyOn(PluginMigrationService, 'hasStorage').mockImplementation((plugin) => plugin.name !== 'plain');
      jest.spyOn(PluginMigrationService, 'loadStorage').mockImplementation((plugin) => storage(plugin.name));

      const found = discoverStoragePlugins([manifest('bookings', '1.4.0'), manifest('plain')]);

      expect(found.descriptors).toEqual([{ id: 'bookings', version: '1.4.0', storage: storage('bookings') }]);
      expect(found.unloadable).toEqual([]);
    });

    it('reports a plugin whose declaration cannot be loaded instead of failing the discovery', () => {
      jest.spyOn(PluginMigrationService, 'hasStorage').mockReturnValue(true);
      jest.spyOn(PluginMigrationService, 'loadStorage').mockImplementation((plugin) => {
        if (plugin.name === 'broken') throw new Error('the declaration is malformed');
        return storage(plugin.name);
      });

      const found = discoverStoragePlugins([manifest('broken'), manifest('fine')]);

      expect(found.descriptors.map((plugin) => plugin.id)).toEqual(['fine']);
      expect(found.unloadable).toEqual([{ name: 'broken', reason: 'the declaration is malformed' }]);
    });

    it('skips a plugin whose storage turns out to be absent', () => {
      jest.spyOn(PluginMigrationService, 'hasStorage').mockReturnValue(true);
      jest.spyOn(PluginMigrationService, 'loadStorage').mockReturnValue(null);
      expect(discoverStoragePlugins([manifest('none')])).toEqual({ descriptors: [], unloadable: [] });
    });
  });

  describe('explainMissingPlugin', () => {
    const refused = (cause: Error, outcome?: 'plugin-storage-kept') =>
      new SqliteTransferError('importing into PostgreSQL', `SnapshotIncompatibleError: ${cause.message}`, {
        cause,
        outcome,
      });
    const missingTable = (table: string) =>
      new MissingTargetStorageError('missing-table', table, `The database has no table ${table}`);

    it('names the missing table, asks for the build for this version, and ends without a doubled full stop', () => {
      const explained = explainMissingPlugin(refused(missingTable('reservations_reservation')), []);

      expect(explained).toBeInstanceOf(SqliteTransferError);
      const message = (explained as Error).message;
      expect(message).toContain(
        'the SQLite data holds data of a plugin that is not installed or not loadable (table reservations_reservation). ' +
          "Install that plugin's build for this Attraccess version in the plugin directory first.",
      );
      expect(message).not.toContain('same version');
      expect(message).not.toContain('..');
    });

    it('names a missing plugin, lists the plugins that could not be loaded and keeps the outcome', () => {
      const cause = new MissingTargetStorageError('missing-plugin', 'bookings', 'Plugin bookings is not installed');
      const explained = explainMissingPlugin(refused(cause, 'plugin-storage-kept'), [
        { name: 'bookings', reason: 'broken declaration' },
      ]) as SqliteTransferError;
      expect(explained.message).toContain('(plugin bookings)');
      expect(explained.message).toContain('plugins that could not be loaded: bookings (broken declaration)');
      expect(explained.outcome).toBe('plugin-storage-kept');
    });

    it('lists every missing table with its rows, grouped by plugin, and keeps the outcome', () => {
      const cause = new MissingTargetStorageError(
        'missing-table',
        'plugin_wago_controllers, legacy_notes',
        'The database has no table plugin_wago_controllers, legacy_notes',
        [
          { name: 'plugin_wago_controllers', rows: 3 },
          { name: 'legacy_notes', rows: 1 },
        ],
      );
      const explained = explainMissingPlugin(refused(cause, 'plugin-storage-kept'), []) as SqliteTransferError;
      expect(explained.outcome).toBe('plugin-storage-kept');
      expect(explained.message).toContain(
        'the SQLite data holds data of a plugin that is not installed or not loadable: plugin "wago" ' +
          '(plugin_wago_controllers: 3 rows), and tables not from any installed plugin: legacy_notes: 1 row. ' +
          'Nothing was imported.',
      );
      expect(explained.message).toContain('See https://docs.attraccess.org/');
    });

    it('decides by the kind of the cause, not by its text', () => {
      const lookalike = refused(new SnapshotIncompatibleError('The database has no table ghost'));
      expect(explainMissingPlugin(lookalike, [])).toBe(lookalike);
    });

    it('passes every other error through unchanged', () => {
      const other = new SqliteTransferError('opening the working copy', 'disk is full');
      expect(explainMissingPlugin(other, [])).toBe(other);
      const plain = new Error('boom');
      expect(explainMissingPlugin(plain, [])).toBe(plain);
    });
  });
});

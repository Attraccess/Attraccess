import { PluginMigrationService } from '../../plugin-system/plugin-migration.service';
import type { LoadedPluginManifest } from '../../plugin-system/plugin.manifest';
import type { CompiledPluginStorage } from '../../plugin-system/plugin-storage/storage-model';
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
    const refused = (reason: string) =>
      new SqliteTransferError('importing into PostgreSQL', `SnapshotIncompatibleError: ${reason}`, {
        cause: new Error(reason),
      });

    it('names the missing table and ends without a doubled full stop', () => {
      const explained = explainMissingPlugin(refused('The database has no table reservations_reservation'), []);

      expect(explained).toBeInstanceOf(SqliteTransferError);
      const message = (explained as Error).message;
      expect(message).toContain('reservations_reservation');
      expect(message).toContain('plugin that is not installed or not loadable');
      expect(message).not.toContain('..');
    });

    it('lists the plugins that were installed but could not be loaded', () => {
      const explained = explainMissingPlugin(refused('Plugin bookings is not installed in the target; install 1.4.0'), [
        { name: 'bookings', reason: 'broken declaration' },
      ]);
      expect((explained as Error).message).toContain('bookings (broken declaration)');
    });

    it('passes every other error through unchanged', () => {
      const other = new SqliteTransferError('opening the working copy', 'disk is full');
      expect(explainMissingPlugin(other, [])).toBe(other);
      expect(explainMissingPlugin(new Error('boom'), [])).toBeInstanceOf(Error);
    });
  });
});

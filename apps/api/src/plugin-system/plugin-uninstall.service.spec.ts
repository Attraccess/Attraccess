import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';
import { NotFoundException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { PluginMigrationService } from './plugin-migration.service';
import { PluginService } from './plugin.service';
import { isPluginRestartRequired } from './runtime/restart-required';
import { isPluginRemoved } from './runtime/removed-plugins';
import { PluginUninstallService } from './plugin-uninstall.service';
import { compilePluginStorage } from './plugin-storage/storage-schema';
import { assertNamespaceUnclaimed, claimStorageNames } from './plugin-storage/storage-registry';

describe('PluginUninstallService', () => {
  const fixture = registerPluginServiceFixture();

  const bleEndpoints = { deleteAllForPlugin: jest.fn().mockResolvedValue(undefined) };
  const readers = { deleteAllForPlugin: jest.fn().mockResolvedValue(undefined) };
  const uninstaller = () => new PluginUninstallService(bleEndpoints as never, readers as never);

  function writeDeletablePlugin(withStorage = false) {
    fixture.writePlugin(fixture.root, 'delete-me', {
      name: 'delete-me',
      version: '1.0.0',
      main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
      attraccessVersion: { min: '2.0.0-0' },
      permissions: withStorage ? ['PLUGIN_STORAGE'] : [],
    });
    const [plugin] = PluginService.getPlugins();
    return plugin;
  }

  it('throws when the plugin id is unknown', async () => {
    await expect(uninstaller().deletePlugin('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes the BLE endpoints the plugin owns, and still uninstalls when that fails', async () => {
    const plugin = writeDeletablePlugin();
    await uninstaller().deletePlugin(plugin.id);
    expect(bleEndpoints.deleteAllForPlugin).toHaveBeenCalledWith(plugin.id);

    const second = writeDeletablePlugin();
    bleEndpoints.deleteAllForPlugin.mockRejectedValueOnce(new Error('db locked'));
    await uninstaller().deletePlugin(second.id);
    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
  });

  it('deletes the plugin readers, and still uninstalls when that fails', async () => {
    const plugin = writeDeletablePlugin();
    await uninstaller().deletePlugin(plugin.id);
    expect(readers.deleteAllForPlugin).toHaveBeenCalledWith(plugin.id);

    const second = writeDeletablePlugin();
    readers.deleteAllForPlugin.mockRejectedValueOnce(new Error('db locked'));
    await uninstaller().deletePlugin(second.id);
    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
  });

  it('refuses the reader and BLE calls of the removed plugin before deleting its rows', async () => {
    const plugin = writeDeletablePlugin();
    let removedWhenReadersWent = false;
    readers.deleteAllForPlugin.mockImplementationOnce(async () => {
      removedWhenReadersWent = isPluginRemoved(plugin.id);
    });

    await uninstaller().deletePlugin(plugin.id);

    expect(removedWhenReadersWent).toBe(true);
    expect(isPluginRemoved(plugin.id)).toBe(true);
  });

  it('refuses the reader and BLE calls of an npm plugin whose health entries it clears on removal', async () => {
    const plugin = writeDeletablePlugin();
    await uninstaller().clearHealthEntries(plugin.name);
    expect(isPluginRemoved(plugin.id)).toBe(true);
  });

  describe('health entries', () => {
    const entry = (id: number, identifier: string, source = 'plugin') => ({
      id,
      resourceId: 5,
      identifier,
      source,
      status: 'unhealthy',
    });
    const healthWith = (entries: ReturnType<typeof entry>[]) => ({
      listBySourceAndPrefix: jest.fn().mockResolvedValue(entries),
      clearEntry: jest.fn().mockResolvedValue(undefined),
    });
    const uninstallerWith = (health: unknown) =>
      new PluginUninstallService(
        bleEndpoints as never,
        readers as never,
        {
          get: () => health,
        } as never,
      );

    it('clears the health entries of the plugin through the clear path', async () => {
      const plugin = writeDeletablePlugin();
      const health = healthWith([
        entry(1, 'plugin:delete-me:lock-1-motor'),
        // a manual entry that merely looks like one of the plugin's is left alone
        entry(2, 'plugin:delete-me:lock-2-motor', 'manual'),
      ]);

      await uninstallerWith(health).deletePlugin(plugin.id);

      expect(health.listBySourceAndPrefix).toHaveBeenCalledWith('plugin', 'plugin:delete-me:');
      expect(health.clearEntry).toHaveBeenCalledTimes(1);
      expect(health.clearEntry).toHaveBeenCalledWith(5, 1, expect.anything());
      expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
    });

    it('still uninstalls when clearing the health entries fails', async () => {
      const plugin = writeDeletablePlugin();
      const health = healthWith([entry(1, 'plugin:delete-me:a')]);
      health.clearEntry.mockRejectedValue(new Error('db locked'));

      await uninstallerWith(health).deletePlugin(plugin.id);

      expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
    });
  });

  it('removes the plugin folder and marks a restart as required without restarting', async () => {
    const plugin = writeDeletablePlugin();
    PluginService.quarantinePlugin(plugin, new Error('prior crash'));

    await uninstaller().deletePlugin(plugin.id);

    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
    expect(PluginService.isPluginQuarantined(plugin)).toBe(false);
    expect(isPluginRestartRequired()).toBe(true);
    expect(setTimeout).not.toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(fixture.restartSpy).not.toHaveBeenCalled();
  });

  it('drops the plugin storage while its bundle is still on disk', async () => {
    const plugin = writeDeletablePlugin(true);
    const folder = join(fixture.root, 'delete-me');
    const runDown = jest
      .spyOn(PluginMigrationService, 'dropStorage')
      .mockImplementation(async () => existsSync(folder));

    await uninstaller().deletePlugin(plugin.id);

    expect(runDown).toHaveBeenCalledWith(expect.objectContaining({ name: 'delete-me' }));
    await expect(runDown.mock.results[0].value).resolves.toBe(true);
    expect(existsSync(folder)).toBe(false);
  });

  it('frees the storage names the plugin claimed', async () => {
    const plugin = writeDeletablePlugin(true);
    jest.spyOn(PluginMigrationService, 'dropStorage').mockResolvedValue(true);
    claimStorageNames(compilePluginStorage('delete-me', { tables: {}, migrations: [] }, { reservedTables: new Set() }));
    expect(() => assertNamespaceUnclaimed('Delete.Me', 'delete_me')).toThrow(/plugin "delete-me"/);

    await uninstaller().deletePlugin(plugin.id);

    expect(() => assertNamespaceUnclaimed('Delete.Me', 'delete_me')).not.toThrow();
  });

  it('still removes the plugin when dropping its storage fails', async () => {
    const plugin = writeDeletablePlugin(true);
    const runDown = jest.spyOn(PluginMigrationService, 'dropStorage').mockRejectedValue(new Error('drop failed'));

    await uninstaller().deletePlugin(plugin.id);

    expect(runDown).toHaveBeenCalled();
    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
  });
});

import { registerPluginServiceFixture } from './plugin.service.plugin-service.test-fixture';
import { NotFoundException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { PluginMigrationService } from './plugin-migration.service';
import { PluginService } from './plugin.service';
import { PluginUninstallService } from './plugin-uninstall.service';
import { compilePluginStorage } from './plugin-storage/storage-schema';
import { assertNamespaceUnclaimed, claimStorageNames } from './plugin-storage/storage-registry';

describe('PluginUninstallService', () => {
  const fixture = registerPluginServiceFixture();

  const bleEndpoints = { deleteAllForPlugin: jest.fn().mockResolvedValue(undefined) };
  const uninstaller = () => new PluginUninstallService(new PluginService(), bleEndpoints as never);

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
    await uninstaller().deletePlugin(plugin.id, true);
    expect(bleEndpoints.deleteAllForPlugin).toHaveBeenCalledWith(plugin.id);

    const second = writeDeletablePlugin();
    bleEndpoints.deleteAllForPlugin.mockRejectedValueOnce(new Error('db locked'));
    await uninstaller().deletePlugin(second.id, true);
    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
  });

  it('removes the plugin folder and schedules a restart', async () => {
    const plugin = writeDeletablePlugin();
    PluginService.quarantinePlugin(plugin, new Error('prior crash'));

    await uninstaller().deletePlugin(plugin.id);

    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
    expect(PluginService.isPluginQuarantined(plugin)).toBe(false);
    fixture.flushScheduledRestart();
    expect(fixture.restartSpy).toHaveBeenCalledTimes(1);
  });

  it('drops the plugin storage while its bundle is still on disk', async () => {
    const plugin = writeDeletablePlugin(true);
    const folder = join(fixture.root, 'delete-me');
    const runDown = jest
      .spyOn(PluginMigrationService, 'dropStorage')
      .mockImplementation(async () => existsSync(folder));

    await uninstaller().deletePlugin(plugin.id, true);

    expect(runDown).toHaveBeenCalledWith(expect.objectContaining({ name: 'delete-me' }));
    await expect(runDown.mock.results[0].value).resolves.toBe(true);
    expect(existsSync(folder)).toBe(false);
  });

  it('frees the storage names the plugin claimed', async () => {
    const plugin = writeDeletablePlugin(true);
    jest.spyOn(PluginMigrationService, 'dropStorage').mockResolvedValue(true);
    claimStorageNames(compilePluginStorage('delete-me', { tables: {}, migrations: [] }, { reservedTables: new Set() }));
    expect(() => assertNamespaceUnclaimed('Delete.Me', 'delete_me')).toThrow(/plugin "delete-me"/);

    await uninstaller().deletePlugin(plugin.id, true);

    expect(() => assertNamespaceUnclaimed('Delete.Me', 'delete_me')).not.toThrow();
  });

  it('still removes the plugin when dropping its storage fails', async () => {
    const plugin = writeDeletablePlugin(true);
    const runDown = jest.spyOn(PluginMigrationService, 'dropStorage').mockRejectedValue(new Error('drop failed'));

    await uninstaller().deletePlugin(plugin.id, true);

    expect(runDown).toHaveBeenCalled();
    expect(existsSync(join(fixture.root, 'delete-me'))).toBe(false);
  });
});
